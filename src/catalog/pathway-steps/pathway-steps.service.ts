import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CareerStatus, ResourceStatus } from '../../generated/prisma/client';
import { PathwayStepDetailDto } from './dto/pathway-step-detail.dto';

@Injectable()
export class PathwayStepsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
