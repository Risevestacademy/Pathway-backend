import {
  PathwayStepStatus,
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
import { computeStageProgress, computeStepStatuses } from '../progress';
import { toStageQuizStatus } from '../stage-quiz-status';

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
    quiz: {
      select: {
        id: true,
        attempts: {
          where: { userId },
          select: { correct: true, total: true },
          take: 1,
        },
      },
    },
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

export interface StepMark {
  pathwayStepId: string;
  status: PathwayStepStatus;
  completedAt: Date | null;
}

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
): PathwayResourcesDto => {
  const completedAtByStep = new Map(
    marks.map(({ pathwayStepId, completedAt }) => [pathwayStepId, completedAt]),
  );

  return {
    pathwayId,
    stages: [...stages]
      .sort((a, b) => a.order - b.order)
      .map((stage) => {
        const steps = [...stage.steps].sort((a, b) => a.order - b.order);
        const statuses = computeStepStatuses(steps, marks);

        return {
          id: stage.id,
          title: stage.title,
          order: stage.order,
          progress: computeStageProgress(steps, marks),
          quiz: toStageQuizStatus(
            stage.quiz ? { id: stage.quiz.id } : null,
            stage.quiz?.attempts[0] ?? null,
          ),
          steps: steps.map((step) => {
            const status =
              statuses.get(step.id) ?? PathwayStepStatus.NOT_STARTED;

            return {
              id: step.id,
              title: step.title,
              order: step.order,
              status,
              completedAt:
                status === PathwayStepStatus.COMPLETED
                  ? (completedAtByStep.get(step.id) ?? null)
                  : null,
              resources: step.resources.map(({ resource }) =>
                toResourceItem(resource, completions),
              ),
            };
          }),
        };
      }),
    optionalPaidCourses: optionalPaidCourses.map((resource) =>
      toResourceItem(resource, completions),
    ),
  };
};

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
