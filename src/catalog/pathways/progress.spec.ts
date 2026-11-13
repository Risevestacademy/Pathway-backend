import {
  computeNextStep,
  computePathwayProgress,
  computeStageProgress,
  type StageForProgress,
  type StepForProgress,
  type UserStepProgress,
} from './progress';
import { PathwayStepStatus } from '../../generated/prisma/client';

// ─── fixtures ────────────────────────────────────────────────────────
const step = (id: string, order: number): StepForProgress => ({ id, order });
const done = (id: string): UserStepProgress => ({
  pathwayStepId: id,
  status: PathwayStepStatus.COMPLETED,
});
const inProgress = (id: string): UserStepProgress => ({
  pathwayStepId: id,
  status: PathwayStepStatus.IN_PROGRESS,
});

const stage = (
  id: string,
  order: number,
  steps: StepForProgress[],
): StageForProgress => ({ id, order, steps });

const twoStages = (): StageForProgress[] => [
  stage('s1', 1, [step('a', 1), step('b', 2)]),
  stage('s2', 2, [step('c', 1), step('d', 2)]),
];

// ─── computeStageProgress ────────────────────────────────────────────
describe('computeStageProgress', () => {
  it('returns all-zero for an empty stage (no steps)', () => {
    expect(computeStageProgress([], [])).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
    });
  });

  it('returns zero progress when nothing is done', () => {
    const steps = [step('a', 1), step('b', 2)];
    expect(computeStageProgress(steps, [])).toEqual({
      completed: 0,
      total: 2,
      percentage: 0,
    });
  });

  it('counts IN_PROGRESS as not completed', () => {
    const steps = [step('a', 1), step('b', 2)];
    const result = computeStageProgress(steps, [inProgress('a')]);
    expect(result).toEqual({ completed: 0, total: 2, percentage: 0 });
  });

  it('handles a gap in the middle', () => {
    const steps = [step('a', 1), step('b', 2), step('c', 3)];
    const result = computeStageProgress(steps, [done('a'), done('c')]);
    expect(result).toEqual({ completed: 2, total: 3, percentage: 67 });
  });

  it('returns 100% when the stage is fully complete', () => {
    const steps = [step('a', 1), step('b', 2)];
    const result = computeStageProgress(steps, [done('a'), done('b')]);
    expect(result).toEqual({ completed: 2, total: 2, percentage: 100 });
  });
});

// ─── computePathwayProgress ──────────────────────────────────────────
describe('computePathwayProgress', () => {
  it('returns all-zero for a pathway with no stages', () => {
    expect(computePathwayProgress([], [])).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
      nextStepId: null,
      selfReported: true,
    });
  });

  it('aggregates across stages', () => {
    const result = computePathwayProgress(twoStages(), [done('a')]);
    expect(result).toMatchObject({
      completed: 1,
      total: 4,
      percentage: 25,
      nextStepId: 'b',
      selfReported: true,
    });
  });

  it('returns 100% with nextStepId null when all complete', () => {
    const result = computePathwayProgress(twoStages(), [
      done('a'),
      done('b'),
      done('c'),
      done('d'),
    ]);
    expect(result).toMatchObject({
      completed: 4,
      total: 4,
      percentage: 100,
      nextStepId: null,
    });
  });
});

// ─── computeNextStep ─────────────────────────────────────────────────
describe('computeNextStep', () => {
  it('returns null for a pathway with no stages', () => {
    expect(computeNextStep([], [])).toBeNull();
  });

  it('returns the first step when nothing is done', () => {
    expect(computeNextStep(twoStages(), [])).toBe('a');
  });

  it('returns a mid-stage gap step when earlier ones are done', () => {
    expect(computeNextStep(twoStages(), [done('a')])).toBe('b');
  });

  it('skips a complete stage and returns the first step of the next', () => {
    expect(computeNextStep(twoStages(), [done('a'), done('b')])).toBe('c');
  });

  it('returns null when all steps across all stages are complete', () => {
    expect(
      computeNextStep(twoStages(), [
        done('a'),
        done('b'),
        done('c'),
        done('d'),
      ]),
    ).toBeNull();
  });

  it('honours a start pointer mid-stage', () => {
    // startStepId = 'b' (stage s1, step order 2). 'b' is incomplete.
    expect(computeNextStep(twoStages(), [], 'b')).toBe('b');
  });

  it('with a start pointer, skips earlier incomplete steps in the same stage', () => {
    // 'a' is incomplete but is before the anchor 'b'.
    expect(computeNextStep(twoStages(), [], 'b')).toBe('b');
  });

  it('with a start pointer in a later stage, ignores earlier stages for next', () => {
    // Anchor is 'c' (stage s2, step order 1). Stage 1 steps 'a','b' are incomplete
    // but before the anchor. The next step is 'c'.
    expect(computeNextStep(twoStages(), [], 'c')).toBe('c');
  });

  it('with a start pointer, later steps beyond the anchor still apply', () => {
    // Anchor 'a' — first incomplete at-or-after 'a' is 'a'.
    expect(computeNextStep(twoStages(), [done('a')], 'a')).toBe('b');
  });

  it('with a start pointer, if anchor step is complete, returns the next incomplete at-or-after it', () => {
    // Anchor 'b' is complete. 'a' is before the anchor (skipped).
    // First incomplete at-or-after 'b' is 'c' (stage s2).
    expect(computeNextStep(twoStages(), [done('a'), done('b')], 'b')).toBe('c');
  });

  it('treats an unknown start step id as no anchor', () => {
    expect(computeNextStep(twoStages(), [], 'nonexistent')).toBe('a');
  });

  it('treats IN_PROGRESS steps as incomplete', () => {
    expect(computeNextStep(twoStages(), [inProgress('a')])).toBe('a');
  });

  it('with a start pointer, skips an earlier incomplete step in the same stage', () => {
    // 'a' and 'b' are both in stage s1. Anchor is 'b'. 'a' is incomplete but before anchor.
    // Stage s1: first incomplete at-or-after 'b' is 'b'. 'a' is not considered.
    expect(computeNextStep(twoStages(), [], 'b')).toBe('b');
  });
});

// ─── idempotency (acceptance criterion) ──────────────────────────────
describe('idempotency', () => {
  it('computeStageProgress returns the same output for the same input', () => {
    const steps = [step('a', 1), step('b', 2)];
    const userSteps = [done('a')];
    expect(computeStageProgress(steps, userSteps)).toEqual(
      computeStageProgress(steps, userSteps),
    );
  });

  it('computePathwayProgress returns the same output for the same input', () => {
    const stages = twoStages();
    const userSteps = [done('a')];
    expect(computePathwayProgress(stages, userSteps)).toEqual(
      computePathwayProgress(stages, userSteps),
    );
  });

  it('computeNextStep returns the same output for the same input', () => {
    const stages = twoStages();
    const userSteps = [done('a')];
    expect(computeNextStep(stages, userSteps)).toBe(
      computeNextStep(stages, userSteps),
    );
    expect(computeNextStep(stages, userSteps, 'c')).toBe(
      computeNextStep(stages, userSteps, 'c'),
    );
  });
});
