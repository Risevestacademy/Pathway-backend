import { PathwayStepStatus, Prisma } from '../../../generated/prisma/client';
import type {
  PathwayCompletedStepDto,
  PathwayProgressDto,
} from '../dto/pathway-progress.dto';
import { computePathwayProgress } from '../progress';
import {
  stageQuizSelect,
  type StepMark,
  toLearningStages,
} from './learning-stages.mapper';

export const pathwayProgressStageSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    order: true,
    quiz: stageQuizSelect(userId),
    steps: {
      orderBy: { order: 'asc' },
      select: { id: true, title: true, order: true },
    },
  }) satisfies Prisma.PathwayStageSelect;

export type PathwayProgressStageRow = Prisma.PathwayStageGetPayload<{
  select: ReturnType<typeof pathwayProgressStageSelect>;
}>;

const timeOf = (date: Date | null): number => date?.getTime() ?? 0;

// Newest first; steps without a completion time last, then by step order
const byCompletedAtDesc = (
  a: PathwayCompletedStepDto,
  b: PathwayCompletedStepDto,
): number => timeOf(b.completedAt) - timeOf(a.completedAt) || a.order - b.order;

export const toPathwayProgress = (
  pathwayId: string,
  stages: PathwayProgressStageRow[],
  marks: StepMark[],
  startStepId: string | null,
): PathwayProgressDto => {
  const learningStages = toLearningStages(stages, marks, () => ({}));
  const { nextStepId, ...progress } = computePathwayProgress(
    learningStages,
    marks,
    startStepId,
  );

  const placedSteps = learningStages.flatMap((stage) =>
    stage.steps.map((step) => ({
      step,
      stage: { id: stage.id, title: stage.title, order: stage.order },
    })),
  );

  const completedSteps = placedSteps
    .filter(({ step }) => step.status === PathwayStepStatus.COMPLETED)
    .map(({ step, stage }) => ({
      id: step.id,
      title: step.title,
      order: step.order,
      completedAt: step.completedAt,
      stage,
    }))
    .sort(byCompletedAtDesc);

  const next = placedSteps.find(({ step }) => step.id === nextStepId);

  return {
    pathwayId,
    progress,
    stages: learningStages.map(({ id, title, order, progress, quiz }) => ({
      id,
      title,
      order,
      progress,
      quiz,
    })),
    completedSteps,
    nextStep: next
      ? {
          id: next.step.id,
          title: next.step.title,
          order: next.step.order,
          stage: next.stage,
        }
      : null,
  };
};
