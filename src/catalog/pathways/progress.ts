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
  selfReported: boolean;
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
 * Aggregates completion across a pathway's steps.
 *
 * `selfReported` reflects whether the user has recorded any progress at all
 * (at least one UserPathwayStep row) as opposed to a freshly-activated
 * pathway with no progress yet. This is an assumption since we didn't
 * explicity decide in the ticket scope.
 */
export function computeProgress(
  steps: StepForProgress[],
  userSteps: UserStepProgress[],
): ProgressSummary {
  const statuses = computeStepStatuses(steps, userSteps);
  const orderedSteps = [...steps].sort((a, b) => a.order - b.order);

  const completed = orderedSteps.filter(
    (step) => statuses.get(step.id) === PathwayStepStatus.COMPLETED,
  ).length;

  const total = orderedSteps.length;

  const nextStep = orderedSteps.find(
    (step) => statuses.get(step.id) !== PathwayStepStatus.COMPLETED,
  );

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextStepId: nextStep?.id ?? null,
    selfReported: userSteps.length > 0,
  };
}
