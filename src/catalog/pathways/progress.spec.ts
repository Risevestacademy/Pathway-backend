import { PathwayStepStatus } from '../../generated/prisma/client';
import {
  computeProgress,
  computeStepStatuses,
  findStepOrder,
} from './progress';

const steps = [
  { id: 's1', order: 1 },
  { id: 's2', order: 2 },
  { id: 's3', order: 3 },
];

describe('computeStepStatuses', () => {
  it('defaults to NOT_STARTED for steps with no row', () => {
    const result = computeStepStatuses(steps, []);
    expect(result.get('s1')).toBe(PathwayStepStatus.NOT_STARTED);
  });

  it('uses the recorded status when present', () => {
    const result = computeStepStatuses(steps, [
      { pathwayStepId: 's2', status: PathwayStepStatus.IN_PROGRESS },
    ]);
    expect(result.get('s2')).toBe(PathwayStepStatus.IN_PROGRESS);
  });
});

describe('computeProgress', () => {
  it('reports zero progress with no user steps, still selfReported', () => {
    const result = computeProgress(steps, []);
    expect(result).toEqual({
      completed: 0,
      total: 3,
      percentage: 0,
      nextStepId: 's1',
      selfReported: true,
    });
  });

  it('counts only COMPLETED steps toward the percentage', () => {
    const result = computeProgress(steps, [
      { pathwayStepId: 's1', status: PathwayStepStatus.COMPLETED },
      { pathwayStepId: 's2', status: PathwayStepStatus.IN_PROGRESS },
    ]);
    expect(result.completed).toBe(1);
    expect(result.percentage).toBe(33);
    expect(result.nextStepId).toBe('s2');
    expect(result.selfReported).toBe(true);
  });

  it('reports nextStepId null and 100% when every step is complete', () => {
    const result = computeProgress(
      steps,
      steps.map((s) => ({
        pathwayStepId: s.id,
        status: PathwayStepStatus.COMPLETED,
      })),
    );
    expect(result.percentage).toBe(100);
    expect(result.nextStepId).toBeNull();
  });

  it('returns 0% rather than dividing by zero for a pathway with no steps', () => {
    const result = computeProgress([], []);
    expect(result).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
      nextStepId: null,
      selfReported: true,
    });
  });

  it('picks the lowest-order incomplete step as nextStepId regardless of input order', () => {
    const shuffled = [steps[2], steps[0], steps[1]];
    const result = computeProgress(shuffled, [
      { pathwayStepId: 's1', status: PathwayStepStatus.COMPLETED },
    ]);
    expect(result.nextStepId).toBe('s2');
  });

  describe('with a starting point', () => {
    it('picks the earliest incomplete step at or after the start', () => {
      const result = computeProgress(steps, [], 2);
      expect(result.nextStepId).toBe('s2');
    });

    it('skips completed steps at or after the start', () => {
      const result = computeProgress(
        steps,
        [{ pathwayStepId: 's2', status: PathwayStepStatus.COMPLETED }],
        2,
      );
      expect(result.nextStepId).toBe('s3');
    });

    it('still counts incomplete steps before the start in the totals', () => {
      const result = computeProgress(
        steps,
        [{ pathwayStepId: 's3', status: PathwayStepStatus.COMPLETED }],
        3,
      );
      expect(result).toMatchObject({ completed: 1, total: 3, percentage: 33 });
    });

    it('falls back to the earliest incomplete step overall when none remain from the start', () => {
      const result = computeProgress(
        steps,
        [
          { pathwayStepId: 's2', status: PathwayStepStatus.COMPLETED },
          { pathwayStepId: 's3', status: PathwayStepStatus.COMPLETED },
        ],
        2,
      );
      expect(result.nextStepId).toBe('s1');
    });

    it('returns nextStepId null for a completed pathway', () => {
      const result = computeProgress(
        steps,
        steps.map((s) => ({
          pathwayStepId: s.id,
          status: PathwayStepStatus.COMPLETED,
        })),
        2,
      );
      expect(result.nextStepId).toBeNull();
      expect(result.percentage).toBe(100);
    });

    it('behaves as before when the start is null', () => {
      expect(computeProgress(steps, [], null)).toEqual(
        computeProgress(steps, []),
      );
    });

    it('handles an empty pathway', () => {
      expect(computeProgress([], [], 1)).toEqual(computeProgress([], []));
    });
  });
});

describe('findStepOrder', () => {
  it("returns the step's order", () => {
    expect(findStepOrder(steps, 's2')).toBe(2);
  });

  it('returns null for a null or unknown step id', () => {
    expect(findStepOrder(steps, null)).toBeNull();
    expect(findStepOrder(steps, 'other-pathway-step')).toBeNull();
  });
});
