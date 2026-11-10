import {
  Prisma,
  ResourceStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import { CareerCardDto } from '../dto/career-card.dto';
import { CareerOverviewDto } from '../dto/career-overview.dto';
import { OutlookItemDto } from '../dto/career-projection.dto';
import {
  CareerRequirementsDto,
  ResourceSummaryDto,
} from '../dto/career-requirements.dto';

const decimalToString = (
  value: Prisma.Decimal | null | undefined,
): string | null => (value == null ? null : value.toString());

// ─── 1. CARD MAPPER ──────────────────────────────────────────────────
export const careerCardSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  iconKey: true,
  targetLevels: true,
  _count: {
    select: {
      resources: true, // Counts CareerResource
    },
  },
  pathway: {
    select: {
      steps: { select: { id: true } }, // Used for topic count
    },
  },
} satisfies Prisma.CareerSelect;

export type CareerCardRow = Prisma.CareerGetPayload<{
  select: typeof careerCardSelect;
}>;

export const toCareerCard = (career: CareerCardRow): CareerCardDto => ({
  id: career.id,
  slug: career.slug,
  title: career.title,
  description: career.description,
  iconKey: career.iconKey,
  targetLevels: career.targetLevels,
  topicCount: career.pathway?.steps.length ?? 0,
  resourceCount: career._count.resources,
});

// ─── 2. OVERVIEW MAPPER ──────────────────────────────────────────────
export const careerOverviewSelect = {
  title: true,
  description: true,
  roleSummary: true,
  exampleActivities: true,
  imageUrl: true, // Detail page banner
  _count: {
    select: {
      resources: true,
    },
  },
  pathway: {
    select: {
      steps: { select: { id: true } },
    },
  },
  skills: {
    select: {
      importance: true,
      skill: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.CareerSelect;

export type CareerOverviewRow = Prisma.CareerGetPayload<{
  select: typeof careerOverviewSelect;
}>;

export const toCareerOverview = (
  career: CareerOverviewRow,
): CareerOverviewDto => ({
  title: career.title,
  description: career.description,
  roleSummary: career.roleSummary,
  exampleActivities: career.exampleActivities,
  imageUrl: career.imageUrl,
  skills: career.skills.map((cs) => ({
    id: cs.skill.id,
    name: cs.skill.name,
    importance: cs.importance,
  })),
  topicCount: career.pathway?.steps.length ?? 0,
  resourceCount: career._count.resources,
});

// ─── 3. PROJECTION MAPPER ────────────────────────────────────────────
export const careerProjectionSelect = {
  outlook: {
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CareerSelect;

export type CareerProjectionRow = Prisma.CareerGetPayload<{
  select: typeof careerProjectionSelect;
}>;

export const toCareerProjection = (
  career: CareerProjectionRow,
): OutlookItemDto[] =>
  career.outlook.map((o) => ({
    id: o.id,
    type: o.type,
    geography: o.geography,
    sourceId: o.sourceId,
    period: o.period,
    median: decimalToString(o.median),
    percentile25: decimalToString(o.percentile25),
    percentile75: decimalToString(o.percentile75),
    currency: o.currency,
    payPeriod: o.payPeriod,
    grossOrNet: o.grossOrNet,
    experienceLevel: o.experienceLevel,
    baseYear: o.baseYear,
    baseValue: o.baseValue,
    projectedYear: o.projectedYear,
    projectedValue: o.projectedValue,
    growthPercent: decimalToString(o.growthPercent),
    demandLevel: o.demandLevel,
  }));

// ─── 4. REQUIREMENTS MAPPER ──────────────────────────────────────────
export const careerRequirementsSelect = {
  resources: {
    where: {
      resource: {
        status: ResourceStatus.ACTIVE, // Excludes WITHDRAWN
      },
    },
    select: {
      resource: {
        select: {
          id: true,
          title: true,
          provider: true,
          url: true,
          type: true,
          costStatus: true,
          estimatedWeeks: true,
          badgeImageUrl: true,
          // curationRationale explicitly omitted
        },
      },
    },
  },
} satisfies Prisma.CareerSelect;

export type CareerRequirementsRow = Prisma.CareerGetPayload<{
  select: typeof careerRequirementsSelect;
}>;

type LinkedResource = CareerRequirementsRow['resources'][number]['resource'];

const toResourceSummary = (r: LinkedResource): ResourceSummaryDto => ({
  id: r.id,
  title: r.title,
  provider: r.provider,
  url: r.url,
  costStatus: r.costStatus,
  estimatedWeeks: r.estimatedWeeks,
  badgeImageUrl: r.badgeImageUrl,
});

export const toCareerRequirements = (
  career: CareerRequirementsRow,
): CareerRequirementsDto => {
  const courses: ResourceSummaryDto[] = [];
  const certifications: ResourceSummaryDto[] = [];

  for (const { resource } of career.resources) {
    switch (resource.type) {
      case ResourceType.COURSE:
        courses.push(toResourceSummary(resource));
        break;
      case ResourceType.CERTIFICATION:
        certifications.push(toResourceSummary(resource));
        break;
      case ResourceType.ARTICLE:
      case ResourceType.VIDEO:
      case ResourceType.BOOK:
        // Requirements tab only surfaces courses & certifications.
        break;
      default: {
        const exhaustive: never = resource.type;
        return exhaustive;
      }
    }
  }

  return { courses, certifications };
};
