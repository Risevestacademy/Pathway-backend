import { Injectable, NotFoundException } from '@nestjs/common';
import { CareerPathwayResponseDto } from './dto/career-pathway.dto';
import { PrismaService } from '../../../prisma';
import { CareerStatus, ResourceStatus } from '../../../generated/prisma/client';

const decimalToString = (
  value: { toString(): string } | null,
): string | null => (value === null ? null : value.toString());

@Injectable()
export class PathwaysService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCareerIsPublished(careerId: string): Promise<void> {
    const career = await this.prisma.career.findFirst({
      where: { id: careerId, status: CareerStatus.PUBLISHED },
      select: { id: true },
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }
  }

  async getCareerPathway(careerId: string): Promise<CareerPathwayResponseDto> {
    await this.assertCareerIsPublished(careerId);

    const pathway = await this.prisma.pathway.findUnique({
      where: { careerId },
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
            description: true,
            learningObjective: true,
            prerequisites: true,
            expectedActivity: true,
            order: true,
            skills: {
              select: { skill: { select: { id: true, name: true } } },
            },
            resources: {
              // Withdrawn resources stay in content maintenance but are not shown publicly
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
        },
      },
    });

    // A published career can legitimately have no pathway yet
    if (!pathway) {
      return { pathway: null };
    }

    return {
      pathway: {
        id: pathway.id,
        careerId: pathway.careerId,
        title: pathway.title,
        description: pathway.description,
        steps: pathway.steps.map((step) => ({
          id: step.id,
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
            certificationCost: decimalToString(resource.certificationCost),
            curationRationale: resource.curationRationale,
            lastCheckedDate: resource.lastCheckedDate,
            skills: resource.skills.map(({ skill }) => skill),
          })),
        })),
      },
    };
  }
}
