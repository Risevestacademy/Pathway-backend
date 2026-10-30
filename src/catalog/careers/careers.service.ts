import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AnalyticsService } from '../../analytics';
import { DomainException } from '../../common';
import {
  CAREER_SNAPSHOT_SCHEMA_VERSION,
  type CareerSnapshot,
  type CareerSnapshotCareer,
} from '../content-revisions';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { CareerListItemDto } from './dto/list-careers.dto';
import {
  CareerStatus,
  Prisma,
  TargetLevel,
} from '../../generated/prisma/client';
import { CareerDetailDto } from './dto/career-detail.dto';
import { DeleteCareerResponseDto } from './dto/delete-career-response.dto';
import { CreateCareerDto } from './dto/create-career.dto';
import { CreateCareerResponseDto } from './dto/create-career-response.dto';
import {
  adminCareerDetailSelect,
  adminCareerListSelect,
  buildAdminCareerWhere,
  toAdminCareerDetail,
} from './admin-career-read';
import { GetAdminCareersQueryDto } from './dto/get-admin-careers-query.dto';
import {
  AdminCareerDetailDto,
  AdminCareerListResponseDto,
} from './dto/admin-career.dto';

const decimalToString = (
  value: { toString(): string } | null,
): string | null => (value === null ? null : value.toString());

const initialSnapshot = (career: CareerSnapshotCareer): CareerSnapshot => ({
  schemaVersion: CAREER_SNAPSHOT_SCHEMA_VERSION,
  career,
  pathway: null,
  steps: [],
  skills: [],
  outlook: [],
  resources: [],
});

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

@Injectable()
export class CareersService {
  private readonly logger = new Logger(CareersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

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
            source: {
              select: {
                name: true,
                url: true,
              },
            },
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
      roleSummary: career.roleSummary ?? '',
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
        source: entry.source?.name ?? '',
        sourceUrl: entry.source?.url ?? null,
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

  getTargetLevels(): TargetLevel[] {
    return Object.values(TargetLevel);
  }

  async createCareer(
    dto: CreateCareerDto,
    actorUserId: string,
  ): Promise<CreateCareerResponseDto> {
    const field = await this.prisma.field.findUnique({
      where: { id: dto.fieldId },
      select: { id: true },
    });
    if (!field) this.rejectUnknownField(dto.fieldId, actorUserId);

    await this.assertTitleAndSlugFree(dto, actorUserId);

    const draft: CareerSnapshotCareer = {
      title: dto.title,
      slug: dto.slug,
      description: dto.description,
      roleSummary: dto.roleSummary ?? null,
      fieldId: dto.fieldId,
      targetLevels: dto.targetLevels ?? [],
      exampleActivities: [],
      typicalEducationNote: null,
      certificationsNote: null,
    };

    let created;
    try {
      created = await this.prisma.career.create({
        data: {
          title: draft.title,
          slug: draft.slug,
          description: draft.description,
          roleSummary: draft.roleSummary,
          fieldId: dto.fieldId,
          targetLevels: draft.targetLevels,
          status: CareerStatus.DRAFT,
          version: 1,
          revisions: {
            create: {
              baseVersion: 1,
              snapshot: initialSnapshot(draft),
              createdById: actorUserId,
            },
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          roleSummary: true,
          fieldId: true,
          targetLevels: true,
          status: true,
          version: true,
          createdAt: true,
          revisions: { select: { id: true, status: true, baseVersion: true } },
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        await this.assertTitleAndSlugFree(dto, actorUserId);
      }

      if (isPrismaError(error, 'P2003')) {
        this.rejectUnknownField(dto.fieldId, actorUserId);
      }

      throw error;
    }

    const {
      revisions: [revision],
      ...career
    } = created;

    this.logger.log(
      { careerId: career.id, revisionId: revision.id, actorUserId },
      'Career draft created',
    );

    return { ...career, revision };
  }

  private async assertTitleAndSlugFree(
    { title, slug }: CreateCareerDto,
    actorUserId: string,
  ): Promise<void> {
    const [titleTaken, slugTaken] = await Promise.all([
      this.prisma.career.findFirst({
        where: { title: { equals: title, mode: 'insensitive' } },
        select: { id: true },
      }),
      this.prisma.career.findFirst({
        where: { slug: { equals: slug, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);

    if (!titleTaken && !slugTaken) return;

    const taken = titleTaken ? 'title' : 'slug';
    const code = titleTaken ? 'CAREER_TITLE_TAKEN' : 'CAREER_SLUG_TAKEN';
    this.logger.warn({ actorUserId, reason: code }, 'Career draft rejected');
    throw new DomainException(
      HttpStatus.CONFLICT,
      code,
      `A career with this ${taken} already exists`,
    );
  }

  private rejectUnknownField(fieldId: string, actorUserId: string): never {
    this.logger.warn(
      { fieldId, actorUserId, reason: 'FIELD_NOT_FOUND' },
      'Career draft rejected',
    );
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'FIELD_NOT_FOUND',
      'Field not found',
    );
  }

  async deleteCareer(
    id: string,
    actorUserId: string,
  ): Promise<DeleteCareerResponseDto> {
    try {
      await this.prisma.career.delete({
        where: {
          id,
          status: CareerStatus.DRAFT,
          publishedAt: null,
          userPathways: { none: {} },
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return this.rejectDelete(id, actorUserId);
      }
      throw error;
    }

    this.logger.log({ careerId: id, actorUserId }, 'Career deleted');
    this.analytics.capture('career_deleted', actorUserId, { careerId: id });

    return { message: 'Career deleted' };
  }

  private async rejectDelete(id: string, actorUserId: string): Promise<never> {
    const career = await this.prisma.career.findUnique({
      where: { id },
      select: {
        status: true,
        publishedAt: true,
        _count: { select: { userPathways: true } },
      },
    });
    if (!career) {
      throw new NotFoundException('Career not found');
    }

    this.logger.warn(
      {
        careerId: id,
        actorUserId,
        status: career.status,
        everPublished: career.publishedAt !== null,
        savedPathways: career._count.userPathways,
        reason: 'CAREER_HAS_HISTORY',
      },
      'Career delete rejected',
    );
    throw new ConflictException(
      'Only a draft career that was never published or saved can be deleted',
    );
  }

  async listCareersForStaff(
    query: GetAdminCareersQueryDto,
  ): Promise<AdminCareerListResponseDto> {
    const { page, limit } = query;
    const where = buildAdminCareerWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.career.findMany({
        where,
        select: adminCareerListSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.career.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getCareerForStaff(id: string): Promise<AdminCareerDetailDto> {
    const career = await this.prisma.career.findUnique({
      where: { id },
      select: adminCareerDetailSelect,
    });

    if (!career) {
      throw new NotFoundException('Career not found');
    }

    return toAdminCareerDetail(career);
  }
}
