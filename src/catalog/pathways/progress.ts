import { PathwayStepStatus } from '../../generated/prisma/client';

export interface StepForProgress {
  id: string;
  order: number;
}

export interface UserStepProgress {
  pathwayStepId: string;
  status: PathwayStepStatus;
}

export interface ProgressSummary {
  completed: number;
  total: number;
  percentage: number;
  nextStepId: string | null;
  selfReported: true;
}

/**
 * Maps each step to its status for this user. Steps with no UserPathwayStep
 * row are NOT_STARTED, matching the schema.
 */
export function computeStepStatuses(
  steps: StepForProgress[],
  userSteps: UserStepProgress[],
): Map<string, PathwayStepStatus> {
  const byStepId = new Map(userSteps.map((s) => [s.pathwayStepId, s.status]));

  return new Map(
    steps.map((step) => [
      step.id,
      byStepId.get(step.id) ?? PathwayStepStatus.NOT_STARTED,
    ]),
  );
}

/**
 * Aggregates completion across all of a pathway's steps. With a `startOrder`,
 * `nextStepId` is the earliest incomplete step at or after it, falling back to
 * the earliest incomplete step overall.
 */
export function computeProgress(
  steps: StepForProgress[],
  userSteps: UserStepProgress[],
  startOrder?: number | null,
): ProgressSummary {
  const statuses = computeStepStatuses(steps, userSteps);
  const orderedSteps = [...steps].sort((a, b) => a.order - b.order);

  const incompleteSteps = orderedSteps.filter(
    (step) => statuses.get(step.id) !== PathwayStepStatus.COMPLETED,
  );

  const total = orderedSteps.length;
  const completed = total - incompleteSteps.length;

  const nextFromStart =
    startOrder == null
      ? undefined
      : incompleteSteps.find((step) => step.order >= startOrder);
  const nextStep = nextFromStart ?? incompleteSteps[0];

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextStepId: nextStep?.id ?? null,
    selfReported: true,
  };
}

export function findStepOrder(
  steps: StepForProgress[],
  stepId: string | null,
): number | null {
  return steps.find((step) => step.id === stepId)?.order ?? null;
}
