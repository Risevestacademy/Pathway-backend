import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { CareerListItemDto } from './dto/list-careers.dto';
import { CareerStatus, ResourceStatus } from '../../generated/prisma/client';
import { CareerDetailDto, OutlookDataDto } from './dto/career-detail.dto';
import { CareerPathwayResponseDto } from './dto/career-pathway.dto';

const decimalToString = (
  value: { toString(): string } | null,
): string | null => (value === null ? null : value.toString());

@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicCareers(
    query: GetCareersQueryDto,
  ): Promise<CareerListItemDto[]> {
    const { level, interest } = query;

    const where = {
      status: CareerStatus.PUBLISHED,
      ...(level && { targetLevels: { has: level } }),
      ...(interest && { field: { slug: interest } }),
    };

    const careers = await this.prisma.career.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
      },
      orderBy: {
        title: 'asc',
      },
    });

    return careers.map((career) => ({
      id: career.id,
      slug: career.slug,
      title: career.title,
      shortDescription: career.description,
    }));
  }

  async getPublishedCareerById(id: string): Promise<CareerDetailDto> {
    const career = await this.prisma.career.findFirst({
      where: { id, status: CareerStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        roleSummary: true,
        exampleActivities: true,
        typicalEducationNote: true,
        certificationsNote: true,
        targetLevels: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        field: { select: { name: true, slug: true } },
        skills: { select: { skill: { select: { id: true, name: true } } } },
        outlook: {
          select: {
            id: true,
            type: true,
            geography: true,
            source: true,
            sourceUrl: true,
            period: true,
            median: true,
            percentile25: true,
            percentile75: true,
            currency: true,
            payPeriod: true,
            grossOrNet: true,
            experienceLevel: true,
            baseYear: true,
            baseValue: true,
            projectedYear: true,
            projectedValue: true,
            growthPercent: true,
            demandLevel: true,
            updatedAt: true,
          },
        },
        pathway: {
          select: {
            id: true,
            title: true,
            _count: { select: { steps: true } },
          },
        },
      },
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }

    const outlook: OutlookDataDto[] = career.outlook.map((entry) => ({
      ...entry,
      median: decimalToString(entry.median),
      percentile25: decimalToString(entry.percentile25),
      percentile75: decimalToString(entry.percentile75),
      growthPercent: decimalToString(entry.growthPercent),
    }));

    return {
      id: career.id,
      slug: career.slug,
      title: career.title,
      description: career.description,
      roleSummary: career.roleSummary,
      exampleActivities: career.exampleActivities,
      typicalEducationNote: career.typicalEducationNote,
      certificationsNote: career.certificationsNote,
      field: career.field,
      targetLevels: career.targetLevels,
      status: career.status,
      publishedAt: career.publishedAt,
      updatedAt: career.updatedAt,
      skills: career.skills.map(({ skill }) => skill),
      outlook,
      pathway: career.pathway
        ? {
            id: career.pathway.id,
            title: career.pathway.title,
            stepCount: career.pathway._count.steps,
          }
        : null,
    };
  }

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
