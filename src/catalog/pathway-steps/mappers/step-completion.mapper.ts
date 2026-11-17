import { PathwayStepStatus } from '../../../generated/prisma/client';
import {
  computePathwayProgress,
  computeStageProgress,
  type StageForProgress,
  type UserStepProgress,
} from '../../pathways/progress';
import type { StepCompletionResponseDto } from '../dto/step-completion-response.dto';

export interface StepCompletionInput {
  stepId: string;
  completedAt: Date | null;
  xpAwarded: number;
  stages: StageForProgress[];
  userSteps: UserStepProgress[];
  startStepId: string | null;
}

export function toStepCompletionResponse({
  stepId,
  completedAt,
  xpAwarded,
  stages,
  userSteps,
  startStepId,
}: StepCompletionInput): StepCompletionResponseDto {
  const progress = computePathwayProgress(stages, userSteps, startStepId);
  const stage = stages.find(({ steps }) =>
    steps.some(({ id }) => id === stepId),
  );

  return {
    stepId,
    status: completedAt
      ? PathwayStepStatus.COMPLETED
      : PathwayStepStatus.NOT_STARTED,
    completedAt,
    progress,
    stageProgress: stage
      ? { stageId: stage.id, ...computeStageProgress(stage.steps, userSteps) }
      : null,
    nextStepId: progress.nextStepId,
    xpAwarded,
  };
}
