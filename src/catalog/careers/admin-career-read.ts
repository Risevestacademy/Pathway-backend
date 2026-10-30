import type { CareerStatus, Prisma } from '../../generated/prisma/client';
import type { AdminCareerDetailDto } from './dto/admin-career.dto';

export const ADMIN_CAREER_MAX_STEPS = 100;
export const ADMIN_STEP_MAX_RESOURCES = 50;

export const adminCareerListSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  version: true,
  updatedAt: true,
  field: { select: { name: true, slug: true } },
} satisfies Prisma.CareerSelect;

export const adminCareerDetailSelect = {
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
  version: true,
  publishedAt: true,
  publishedById: true,
  reviewedAt: true,
  reviewedById: true,
  createdAt: true,
  updatedAt: true,
  field: { select: { id: true, name: true, slug: true } },
  skills: {
    select: {
      importance: true,
      skill: { select: { id: true, name: true } },
    },
  },
  outlook: {
    select: {
      id: true,
      type: true,
      geography: true,
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
      source: {
        select: { id: true, name: true, url: true, lastCheckedAt: true },
      },
    },
  },
  pathway: {
    select: {
      id: true,
      title: true,
      description: true,
      steps: {
        orderBy: { order: 'asc' },
        take: ADMIN_CAREER_MAX_STEPS,
        select: {
          id: true,
          order: true,
          title: true,
          description: true,
          learningObjective: true,
          prerequisites: true,
          expectedActivity: true,
          skills: { select: { skill: { select: { id: true, name: true } } } },
          resources: {
            orderBy: { resource: { title: 'asc' } },
            take: ADMIN_STEP_MAX_RESOURCES,
            select: {
              resource: {
                select: {
                  id: true,
                  title: true,
                  url: true,
                  type: true,
                  provider: true,
                  costStatus: true,
                  status: true,
                  lastCheckedDate: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CareerSelect;

export type AdminCareerDetailRow = Prisma.CareerGetPayload<{
  select: typeof adminCareerDetailSelect;
}>;

export function buildAdminCareerWhere(query: {
  status?: CareerStatus;
  search?: string;
}): Prisma.CareerWhereInput {
  const search = query.search?.trim();

  return {
    ...(query.status && { status: query.status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };
}

const decimalToString = (value: { toString(): string } | null) =>
  value === null ? null : value.toString();

export function toAdminCareerDetail(
  career: AdminCareerDetailRow,
): AdminCareerDetailDto {
  const { skills, outlook, pathway, ...rest } = career;

  return {
    ...rest,
    skills: skills.map(({ importance, skill }) => ({ ...skill, importance })),
    outlook: outlook.map((entry) => ({
      ...entry,
      median: decimalToString(entry.median),
      percentile25: decimalToString(entry.percentile25),
      percentile75: decimalToString(entry.percentile75),
      growthPercent: decimalToString(entry.growthPercent),
    })),
    pathway: pathway && {
      ...pathway,
      steps: pathway.steps.map(
        ({ skills: stepSkills, resources, ...step }) => ({
          ...step,
          skills: stepSkills.map(({ skill }) => skill),
          resources: resources.map(({ resource }) => resource),
        }),
      ),
    },
  };
}
