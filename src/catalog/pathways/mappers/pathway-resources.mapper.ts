import {
  Prisma,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import type {
  PathwayResourceDetailDto,
  PathwayResourceItemDto,
  PathwayResourcesDto,
} from '../dto/pathway-resources.dto';
import {
  stageQuizSelect,
  type StepMark,
  toLearningStages,
} from './learning-stages.mapper';

export const resourceItemSelect = {
  id: true,
  title: true,
  provider: true,
  type: true,
  costStatus: true,
  estimatedWeeks: true,
  lastCheckedDate: true,
} satisfies Prisma.ResourceSelect;

export const resourceDetailSelect = {
  ...resourceItemSelect,
  description: true,
  outcomes: true,
  url: true,
} satisfies Prisma.ResourceSelect;

export const pathwayResourcesStageSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    order: true,
    quiz: stageQuizSelect(userId),
    steps: {
      orderBy: { order: 'asc' },
      select: {
        id: true,
        title: true,
        order: true,
        resources: {
          where: { resource: { status: ResourceStatus.ACTIVE } },
          orderBy: { resource: { title: 'asc' } },
          select: { resource: { select: resourceItemSelect } },
        },
      },
    },
  }) satisfies Prisma.PathwayStageSelect;

export const optionalPaidCoursesWhere = (
  careerId: string,
  pathwayId: string,
): Prisma.ResourceWhereInput => ({
  status: ResourceStatus.ACTIVE,
  type: ResourceType.COURSE,
  costStatus: ResourceCostStatus.PAID,
  careerResources: { some: { careerId } },
  pathwaySteps: { none: { pathwayStep: { pathwayId } } },
});

export type ResourceItemRow = Prisma.ResourceGetPayload<{
  select: typeof resourceItemSelect;
}>;

export type ResourceDetailRow = Prisma.ResourceGetPayload<{
  select: typeof resourceDetailSelect;
}>;

export type PathwayResourcesStageRow = Prisma.PathwayStageGetPayload<{
  select: ReturnType<typeof pathwayResourcesStageSelect>;
}>;

export interface NextTaskRow {
  id: string;
  title: string;
  goal: string;
  estimatedWeeks: number | null;
}

export const resourceIdsOf = (
  stages: PathwayResourcesStageRow[],
  optionalPaidCourses: ResourceItemRow[],
): string[] => [
  ...new Set([
    ...stages.flatMap((stage) =>
      stage.steps.flatMap((step) =>
        step.resources.map(({ resource }) => resource.id),
      ),
    ),
    ...optionalPaidCourses.map(({ id }) => id),
  ]),
];

export const toResourceItem = (
  resource: ResourceItemRow,
  completions: Map<string, Date>,
): PathwayResourceItemDto => {
  const completedAt = completions.get(resource.id) ?? null;
  return {
    id: resource.id,
    title: resource.title,
    provider: resource.provider,
    type: resource.type,
    costStatus: resource.costStatus,
    estimatedWeeks: resource.estimatedWeeks,
    lastCheckedDate: resource.lastCheckedDate,
    isCompleted: completedAt !== null,
    completedAt,
  };
};

export const toPathwayResources = (
  pathwayId: string,
  stages: PathwayResourcesStageRow[],
  marks: StepMark[],
  optionalPaidCourses: ResourceItemRow[],
  completions: Map<string, Date>,
): PathwayResourcesDto => ({
  pathwayId,
  stages: toLearningStages(stages, marks, (step) => ({
    resources: step.resources.map(({ resource }) =>
      toResourceItem(resource, completions),
    ),
  })),
  optionalPaidCourses: optionalPaidCourses.map((resource) =>
    toResourceItem(resource, completions),
  ),
});

export const toPathwayResourceDetail = (
  resource: ResourceDetailRow,
  completions: Map<string, Date>,
  usageNote: string | null,
  nextTask: NextTaskRow | null,
): PathwayResourceDetailDto => ({
  ...toResourceItem(resource, completions),
  description: resource.description,
  outcomes: resource.outcomes,
  url: resource.url,
  usageNote,
  nextTask,
});
