import { PathwayStepStatus } from '../../generated/prisma/client';
import { computeProgress, computeStepStatuses } from './progress';

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
  it('reports zero progress and selfReported false with no user steps', () => {
    const result = computeProgress(steps, []);
    expect(result).toEqual({
      completed: 0,
      total: 3,
      percentage: 0,
      nextStepId: 's1',
      selfReported: false,
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
      selfReported: false,
    });
  });

  it('picks the lowest-order incomplete step as nextStepId regardless of input order', () => {
    const shuffled = [steps[2], steps[0], steps[1]];
    const result = computeProgress(shuffled, [
      { pathwayStepId: 's1', status: PathwayStepStatus.COMPLETED },
    ]);
    expect(result.nextStepId).toBe('s2');
  });
});
