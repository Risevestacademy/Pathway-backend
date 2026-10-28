import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CareerStatus, PathwayStepStatus } from '../../generated/prisma/client';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';
import {
  ActivePathwayProgressDto,
  ActivePathwayResponseDto,
} from './dto/active-pathway-response.dto';
import {
  computeProgress,
  computeStepStatuses,
  findStepOrder,
} from './progress';
import { StartingPointResponseDto } from './dto/starting-point-response.dto';
import { SavedPathwayDto } from './dto/saved-pathway.dto';
import { AnalyticsService } from '../../analytics';

@Injectable()
export class PathwaysService {
  private readonly logger = new Logger(PathwaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getPathwayMetadata(pathwayId: string): Promise<PathwayMetadataDto> {
    const pathway = await this.prisma.pathway.findFirst({
      where: {
        id: pathwayId,
        career: { status: CareerStatus.PUBLISHED },
      },
      select: {
        id: true,
        careerId: true,
        title: true,
        description: true,
        steps: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            order: true,
            description: true,
          },
        },
      },
    });

    if (!pathway) {
      throw new NotFoundException('Pathway not found');
    }

    return {
      id: pathway.id,
      careerId: pathway.careerId,
      title: pathway.title,
      description: pathway.description,
      stepCount: pathway.steps.length,
      steps: pathway.steps,
    };
  }

  async setActivePathway(
    userId: string,
    careerId: string,
  ): Promise<ActivePathwayResponseDto> {
    const career = await this.prisma.career.findFirst({
      where: { id: careerId, status: CareerStatus.PUBLISHED },
      select: { id: true },
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }

    const pathway = await this.prisma.pathway.findUnique({
      where: { careerId },
      select: { id: true },
    });

    if (!pathway) {
      throw new ConflictException('This career has no pathway yet');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

      await tx.userPathway.updateMany({
        where: { userId, isActive: true, careerId: { not: careerId } },
        data: { isActive: false },
      });

      await tx.userPathway.upsert({
        where: { userId_careerId: { userId, careerId } },
        create: { userId, careerId, isActive: true },
        update: { isActive: true },
      });
    });

    this.analytics.capture('pathway_saved', userId, { careerId });

    return this.getActivePathway(userId);
  }

  async setStartingPoint(
    userId: string,
    careerId: string,
    stepId: string | null,
  ): Promise<StartingPointResponseDto> {
    const userPathway = await this.prisma.userPathway.findFirst({
      where: {
        userId,
        careerId,
        career: {
          status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
        },
      },
      select: {
        id: true,
        career: { select: { pathway: { select: { id: true } } } },
      },
    });

    const pathwayId = userPathway?.career.pathway?.id;

    if (!userPathway || !pathwayId) {
      this.logger.warn(
        { userId, careerId, reason: 'PATHWAY_NOT_SAVED' },
        'Starting point update rejected',
      );
      throw new NotFoundException('Saved pathway not found');
    }

    if (stepId !== null) {
      const step = await this.prisma.pathwayStep.findFirst({
        where: { id: stepId, pathwayId },
        select: { id: true },
      });

      if (!step) {
        this.logger.warn(
          { userId, careerId, stepId, reason: 'STEP_NOT_IN_PATHWAY' },
          'Starting point update rejected',
        );
        throw new BadRequestException(
          "Step does not belong to this career's pathway",
        );
      }
    }

    await this.prisma.userPathway.update({
      where: { id: userPathway.id },
      data: { startStepId: stepId },
    });

    this.logger.log(
      { userId, careerId, startStepId: stepId },
      'Starting point set',
    );

    return {
      careerId,
      startStepId: stepId,
      progress: await this.getPathwayProgress(userId, pathwayId, stepId),
    };
  }

  private async getPathwayProgress(
    userId: string,
    pathwayId: string,
    startStepId: string | null,
  ): Promise<ActivePathwayProgressDto> {
    const [steps, userSteps] = await Promise.all([
      this.prisma.pathwayStep.findMany({
        where: { pathwayId },
        select: { id: true, order: true },
      }),
      this.prisma.userPathwayStep.findMany({
        where: { userId, pathwayStep: { pathwayId } },
        select: { pathwayStepId: true, status: true },
      }),
    ]);

    const progress = computeProgress(
      steps,
      userSteps,
      findStepOrder(steps, startStepId),
    );

    return { ...progress, startStepId };
  }

  async getActivePathway(userId: string): Promise<ActivePathwayResponseDto> {
    const activeUserPathway = await this.prisma.userPathway.findFirst({
      where: { userId, isActive: true },
      select: {
        startStepId: true,
        career: {
          select: {
            id: true,
            slug: true,
            title: true,
            roleSummary: true,
            status: true,
            pathway: {
              select: {
                id: true,
                title: true,
                steps: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    order: true,
                    title: true,
                    skills: {
                      select: { skill: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!activeUserPathway) {
      return { career: null, pathway: null, progress: null, steps: [] };
    }

    const { career, startStepId } = activeUserPathway;

    if (!career.pathway) {
      return { career: null, pathway: null, progress: null, steps: [] };
    }

    const { pathway } = career;

    const userSteps = await this.prisma.userPathwayStep.findMany({
      where: { userId, pathwayStep: { pathwayId: pathway.id } },
      select: { pathwayStepId: true, status: true },
    });

    const statuses = computeStepStatuses(pathway.steps, userSteps);
    const progress = computeProgress(
      pathway.steps,
      userSteps,
      findStepOrder(pathway.steps, startStepId),
    );

    return {
      career: {
        id: career.id,
        slug: career.slug,
        title: career.title,
        roleSummary: career.roleSummary ?? '',
        retired: career.status === CareerStatus.RETIRED,
      },
      pathway: { id: pathway.id, title: pathway.title },
      progress: { ...progress, startStepId },
      steps: pathway.steps.map((step) => ({
        id: step.id,
        order: step.order,
        title: step.title,
        skills: step.skills.map(({ skill }) => skill),
        status: statuses.get(step.id) ?? PathwayStepStatus.NOT_STARTED,
      })),
    };
  }

  async getSavedPathways(userId: string): Promise<SavedPathwayDto[]> {
    const userPathways = await this.prisma.userPathway.findMany({
      where: {
        userId,
        career: {
          status: { in: [CareerStatus.PUBLISHED, CareerStatus.RETIRED] },
        },
      },
      select: {
        isActive: true,
        startStepId: true,
        career: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            pathway: {
              select: {
                steps: { select: { id: true, order: true } },
              },
            },
          },
        },
      },
    });

    const allUserSteps = await this.prisma.userPathwayStep.findMany({
      where: { userId },
      select: { pathwayStepId: true, status: true },
    });

    return userPathways
      .filter((up) => up.career.pathway !== null)
      .map((up) => {
        const { career } = up;
        const steps = career.pathway!.steps;
        const stepIds = new Set(steps.map((s) => s.id));
        const relevantUserSteps = allUserSteps.filter((s) =>
          stepIds.has(s.pathwayStepId),
        );

        const { completed, total, percentage } = computeProgress(
          steps,
          relevantUserSteps,
          findStepOrder(steps, up.startStepId),
        );

        return {
          career: {
            id: career.id,
            slug: career.slug,
            title: career.title,
            retired: career.status === CareerStatus.RETIRED,
          },
          isActive: up.isActive,
          progress: { completed, total, percentage },
        };
      });
  }
}
