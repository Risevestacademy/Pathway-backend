import { Prisma, ResourceStatus } from '../../../generated/prisma/client';
import type {
  PathwayTaskDetailDto,
  PathwayTaskItemDto,
  PathwayTasksDto,
} from '../dto/pathway-tasks.dto';
import {
  stageQuizSelect,
  type StepMark,
  toLearningStages,
} from './learning-stages.mapper';

export const taskItemSelect = {
  id: true,
  title: true,
  goal: true,
  estimatedWeeks: true,
  _count: { select: { checklistItems: true } },
} satisfies Prisma.PathwayStepTaskSelect;

export const pathwayTasksStageSelect = (userId: string) =>
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
        tasks: { orderBy: { order: 'asc' }, select: taskItemSelect },
      },
    },
  }) satisfies Prisma.PathwayStageSelect;

export const taskDetailSelect = (userId: string) =>
  ({
    ...taskItemSelect,
    stepId: true,
    whatToMake: true,
    hints: true,
    checklistItems: {
      orderBy: { order: 'asc' },
      select: {
        id: true,
        text: true,
        userChecks: { where: { userId }, select: { checkedAt: true } },
      },
    },
    resources: {
      where: { resource: { status: ResourceStatus.ACTIVE } },
      orderBy: { order: 'asc' },
      select: {
        resource: {
          select: {
            id: true,
            title: true,
            provider: true,
            type: true,
            costStatus: true,
            url: true,
          },
        },
      },
    },
  }) satisfies Prisma.PathwayStepTaskSelect;

export type TaskItemRow = Prisma.PathwayStepTaskGetPayload<{
  select: typeof taskItemSelect;
}>;

export type PathwayTasksStageRow = Prisma.PathwayStageGetPayload<{
  select: ReturnType<typeof pathwayTasksStageSelect>;
}>;

export type TaskDetailRow = Prisma.PathwayStepTaskGetPayload<{
  select: ReturnType<typeof taskDetailSelect>;
}>;

export interface ChecklistCheckRow {
  item: { taskId: string };
}

export const taskIdsOf = (stages: PathwayTasksStageRow[]): string[] =>
  stages.flatMap((stage) =>
    stage.steps.flatMap((step) => step.tasks.map(({ id }) => id)),
  );

export const toTaskItem = (
  task: TaskItemRow,
  completions: Map<string, Date>,
  checklistChecked: number,
): PathwayTaskItemDto => {
  const completedAt = completions.get(task.id) ?? null;
  return {
    id: task.id,
    title: task.title,
    goal: task.goal,
    estimatedWeeks: task.estimatedWeeks,
    isCompleted: completedAt !== null,
    completedAt,
    checklistChecked,
    checklistTotal: task._count.checklistItems,
  };
};

export const toPathwayTasks = (
  pathwayId: string,
  stages: PathwayTasksStageRow[],
  marks: StepMark[],
  checks: ChecklistCheckRow[],
  completions: Map<string, Date>,
): PathwayTasksDto => {
  const checkedByTask = new Map<string, number>();
  for (const { item } of checks) {
    checkedByTask.set(item.taskId, (checkedByTask.get(item.taskId) ?? 0) + 1);
  }

  return {
    pathwayId,
    stages: toLearningStages(stages, marks, (step) => ({
      tasks: step.tasks.map((task) =>
        toTaskItem(task, completions, checkedByTask.get(task.id) ?? 0),
      ),
    })),
  };
};

export const toPathwayTaskDetail = (
  task: TaskDetailRow,
  completions: Map<string, Date>,
): PathwayTaskDetailDto => {
  const checklist = task.checklistItems.map(({ id, text, userChecks }) => {
    const checkedAt = userChecks[0]?.checkedAt ?? null;
    return { id, text, isChecked: checkedAt !== null, checkedAt };
  });

  return {
    ...toTaskItem(
      task,
      completions,
      checklist.filter(({ isChecked }) => isChecked).length,
    ),
    stepId: task.stepId,
    whatToMake: task.whatToMake,
    hints: task.hints,
    checklist,
    helpfulLinks: task.resources.map(({ resource }) => resource),
  };
};
