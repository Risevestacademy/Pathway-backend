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

// ─── Stage-aware additions (T9.1) ────────────────────────────────────

/**
 * A stage with its steps, already ordered by `step.order` within the stage.
 * Callers group steps by stage before invoking the stage-aware functions;
 * the pure functions themselves stay unaware of `stageId` on steps.
 */
export interface StageForProgress {
  id: string;
  order: number;
  steps: StepForProgress[];
}

export interface StageProgressSummary {
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Completion for a single stage. Same math as `computeProgress` but
 * scoped to one stage's steps — no next-step, no start pointer.
 */
export function computeStageProgress(
  steps: StepForProgress[],
  userSteps: UserStepProgress[],
): StageProgressSummary {
  const statuses = computeStepStatuses(steps, userSteps);
  const total = steps.length;
  const completed = steps.filter(
    (step) => statuses.get(step.id) === PathwayStepStatus.COMPLETED,
  ).length;

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/**
 * Pathway-level completion plus the next-step pointer, computed from the
 * user's marks across all stages.
 *
 * Next-step resolution (per T9.1 scope):
 *  - stages walked in `stage.order`
 *  - complete stages skipped
 *  - within a stage, steps walked in `step.order`
 *  - with `startStepId`, anything strictly before the anchor's (stage, step)
 *    position is ignored for *next-step*, but still counted in progress
 *    (earlier steps stay incomplete, not skipped)
 *  - returns the first incomplete step at-or-after the anchor, or null when
 *    every step is complete
 */
export function computePathwayProgress(
  stages: StageForProgress[],
  userSteps: UserStepProgress[],
  startStepId?: string | null,
): ProgressSummary {
  const allSteps = stages.flatMap((s) => s.steps);
  const statuses = computeStepStatuses(allSteps, userSteps);
  const total = allSteps.length;
  const completed = allSteps.filter(
    (step) => statuses.get(step.id) === PathwayStepStatus.COMPLETED,
  ).length;

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextStepId: computeNextStep(stages, userSteps, startStepId),
    selfReported: true,
  };
}

/**
 * The id of the next step for this user, in stage-then-step order.
 *
 * - Complete stages and complete steps are skipped.
 * - With a start pointer, the walk begins at the start step (earlier steps are
 *   not revisited, they stay incomplete in progress).
 * - If nothing at or after the start step is incomplete, the walk falls back to
 *   the earliest incomplete step overall.
 * - Returns null only when every step is complete.
 */

export function computeNextStep(
  stages: StageForProgress[],
  userSteps: UserStepProgress[],
  startStepId?: string | null,
): string | null {
  const orderedStages = [...stages].sort((a, b) => a.order - b.order);
  const statuses = computeStepStatuses(
    orderedStages.flatMap((s) => s.steps),
    userSteps,
  );
  const anchor = startStepId ? findAnchor(orderedStages, startStepId) : null;

  const walk = (fromAnchor: boolean): string | null => {
    for (const stage of orderedStages) {
      const stageComplete = stage.steps.every(
        (step) => statuses.get(step.id) === PathwayStepStatus.COMPLETED,
      );
      if (stageComplete) continue;

      for (const step of [...stage.steps].sort((a, b) => a.order - b.order)) {
        if (statuses.get(step.id) === PathwayStepStatus.COMPLETED) continue;

        if (fromAnchor && anchor) {
          const beforeStage = stage.order < anchor.stageOrder;
          const sameStageBeforeStep =
            stage.order === anchor.stageOrder && step.order < anchor.stepOrder;
          if (beforeStage || sameStageBeforeStep) continue;
        }

        return step.id;
      }
    }
    return null;
  };

  const fromStart = anchor ? walk(true) : null;
  return fromStart ?? walk(false);
}

interface AnchorPosition {
  stageOrder: number;
  stepOrder: number;
}

function findAnchor(
  orderedStages: StageForProgress[],
  stepId: string,
): AnchorPosition | null {
  for (const stage of orderedStages) {
    const step = stage.steps.find((s) => s.id === stepId);
    if (step) return { stageOrder: stage.order, stepOrder: step.order };
  }
  return null;
}
