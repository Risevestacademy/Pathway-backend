import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { CareerListItemDto } from './dto/list-careers.dto';
import { CareerStatus, ResourceStatus } from '../../generated/prisma/client';
import { CareerDetailDto } from './dto/career-detail.dto';
import { CareerPathwayResponseDto } from './pathways/dto/career-pathway.dto';

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
      where: {
        id,
        status: CareerStatus.PUBLISHED,
      },
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

        field: {
          select: {
            name: true,
            slug: true,
          },
        },

        skills: {
          select: {
            skill: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

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
            _count: {
              select: {
                steps: true,
              },
            },
          },
        },
      },
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }

    return {
      id: career.id,
      slug: career.slug,
      title: career.title,
      description: career.description,
      roleSummary: career.roleSummary,
      exampleActivities: career.exampleActivities,
      typicalEducationNote: career.typicalEducationNote,
      certificationsNote: career.certificationsNote,
      targetLevels: career.targetLevels,
      status: career.status,
      publishedAt: career.publishedAt,
      updatedAt: career.updatedAt,

      field: career.field,

      skills: career.skills.map(({ skill }) => skill),

      outlook: career.outlook.map((entry) => ({
        ...entry,
        median: decimalToString(entry.median),
        percentile25: decimalToString(entry.percentile25),
        percentile75: decimalToString(entry.percentile75),
        growthPercent: decimalToString(entry.growthPercent),
      })),

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
}
