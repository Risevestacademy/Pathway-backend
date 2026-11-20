import { PathwayStepStatus, Prisma } from '../../../generated/prisma/client';
import type {
  PathwayLearningStageDto,
  PathwayLearningStepDto,
} from '../dto/pathway-learning.dto';
import { computeStageProgress, computeStepStatuses } from '../progress';
import { toStageQuizStatus } from '../stage-quiz-status';

export interface StepMark {
  pathwayStepId: string;
  status: PathwayStepStatus;
  completedAt: Date | null;
}

export const stageQuizSelect = (userId: string) =>
  ({
    select: {
      id: true,
      attempts: {
        where: { userId },
        orderBy: { correct: 'desc' },
        select: { correct: true, total: true },
        take: 1,
      },
    },
  }) satisfies Prisma.StageQuizDefaultArgs;

export interface LearningStepRow {
  id: string;
  title: string;
  order: number;
}

export interface LearningStageRow<S extends LearningStepRow> {
  id: string;
  title: string;
  order: number;
  quiz: { id: string; attempts: { correct: number; total: number }[] } | null;
  steps: S[];
}

export type LearningStage<T> = PathwayLearningStageDto & {
  steps: (PathwayLearningStepDto & T)[];
};

// Stages and steps in order, with step status, stage progress and quiz status
export const toLearningStages = <S extends LearningStepRow, T extends object>(
  stages: LearningStageRow<S>[],
  marks: StepMark[],
  toStepContent: (step: S) => T,
): LearningStage<T>[] => {
  const completedAtByStep = new Map(
    marks.map(({ pathwayStepId, completedAt }) => [pathwayStepId, completedAt]),
  );

  return [...stages]
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
          const status = statuses.get(step.id) ?? PathwayStepStatus.NOT_STARTED;

          return {
            id: step.id,
            title: step.title,
            order: step.order,
            status,
            completedAt:
              status === PathwayStepStatus.COMPLETED
                ? (completedAtByStep.get(step.id) ?? null)
                : null,
            ...toStepContent(step),
          };
        }),
      };
    });
};
