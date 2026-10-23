import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  CareerStatus,
  ResourceStatus,
  PathwayStepStatus,
} from '../../generated/prisma/client';
import { PathwayStepDetailDto } from './dto/pathway-step-detail.dto';
import {
  type StepCompletionStatus,
  StepStatusResponseDto,
} from './dto/step-status-response.dto';
import { AnalyticsService } from '../../analytics';
import * as Progress from '../pathways/progress';

@Injectable()
export class PathwayStepsService {
  private readonly logger = new Logger(PathwayStepsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getPathwayStepById(stepId: string): Promise<PathwayStepDetailDto> {
    const step = await this.prisma.pathwayStep.findFirst({
      where: {
        id: stepId,
        pathway: { career: { status: CareerStatus.PUBLISHED } },
      },
      select: {
        id: true,
        pathwayId: true,
        title: true,
        description: true,
        learningObjective: true,
        prerequisites: true,
        expectedActivity: true,
        order: true,
        pathway: { select: { careerId: true } },
        skills: {
          select: { skill: { select: { id: true, name: true } } },
        },
        resources: {
          where: { resource: { status: ResourceStatus.ACTIVE } },
          select: {
            resource: {
              select: {
                id: true,
                title: true,
                description: true,
                url: true,
                type: true,
                provider: true,
                costStatus: true,
                certificationCost: true,
                curationRationale: true,
                lastCheckedDate: true,
                skills: {
                  select: { skill: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!step) {
      throw new NotFoundException('Pathway step not found');
    }

    return {
      id: step.id,
      pathwayId: step.pathwayId,
      careerId: step.pathway.careerId,
      title: step.title,
      description: step.description,
      learningObjective: step.learningObjective,
      prerequisites: step.prerequisites,
      expectedActivity: step.expectedActivity,
      order: step.order,
      skills: step.skills.map(({ skill }) => skill),
      resources: step.resources.map(({ resource }) => ({
        id: resource.id,
        title: resource.title,
        description: resource.description,
        url: resource.url,
        type: resource.type,
        provider: resource.provider,
        costStatus: resource.costStatus,
        certificationCost: resource.certificationCost?.toString() ?? null,
        curationRationale: resource.curationRationale,
        lastCheckedDate: resource.lastCheckedDate,
        skills: resource.skills.map(({ skill }) => skill),
      })),
    };
  }

  async setStepStatus(
    userId: string,
    stepId: string,
    status: StepCompletionStatus,
  ): Promise<StepStatusResponseDto> {
    const step = await this.prisma.pathwayStep.findFirst({
      where: {
        id: stepId,
        pathway: {
          career: {
            OR: [
              { status: CareerStatus.PUBLISHED },
              {
                status: CareerStatus.RETIRED,
                userPathways: { some: { userId } },
              },
            ],
          },
        },
      },
      select: { pathwayId: true, pathway: { select: { careerId: true } } },
    });

    if (!step) {
      this.logger.warn(
        { userId, stepId, reason: 'STEP_NOT_FOUND' },
        'Step status update rejected',
      );
      throw new NotFoundException('Step not found');
    }

    const { careerId } = step.pathway;

    const userPathway = await this.prisma.userPathway.findUnique({
      where: { userId_careerId: { userId, careerId } },
      select: { startStepId: true },
    });

    if (!userPathway) {
      this.logger.warn(
        { userId, stepId, reason: 'CAREER_NOT_SAVED' },
        'Step status update rejected',
      );
      throw new ConflictException('Save this career before tracking its steps');
    }

    const changed = await this.writeStepStatus(userId, stepId, status);

    if (changed) {
      this.logger.log({ userId, stepId, status }, 'Step status changed');
      this.analytics.capture('step_completion_changed', userId, {
        careerId,
        stepId,
        status,
      });
    }

    const [steps, userSteps] = await Promise.all([
      this.prisma.pathwayStep.findMany({
        where: { pathwayId: step.pathwayId },
        select: { id: true, order: true },
      }),
      this.prisma.userPathwayStep.findMany({
        where: { userId, pathwayStep: { pathwayId: step.pathwayId } },
        select: { pathwayStepId: true, status: true },
      }),
    ]);

    const progress = Progress.computeProgress(
      steps,
      userSteps,
      Progress.findStepOrder(steps, userPathway.startStepId),
    );

    return {
      stepId,
      status,
      progress: { ...progress, startStepId: userPathway.startStepId },
    };
  }

  // Conditional writes, so only a real change returns true
  private async writeStepStatus(
    userId: string,
    pathwayStepId: string,
    status: StepCompletionStatus,
  ): Promise<boolean> {
    const completedAt =
      status === PathwayStepStatus.COMPLETED ? new Date() : null;

    const updated = await this.prisma.userPathwayStep.updateMany({
      where: { userId, pathwayStepId, status: { not: status } },
      data: { status, completedAt },
    });

    if (updated.count > 0) {
      return true;
    }

    // A missing row already reads as NOT_STARTED
    if (status === PathwayStepStatus.NOT_STARTED) {
      return false;
    }

    const created = await this.prisma.userPathwayStep.createMany({
      data: [{ userId, pathwayStepId, status, completedAt }],
      skipDuplicates: true,
    });

    return created.count > 0;
  }
}
