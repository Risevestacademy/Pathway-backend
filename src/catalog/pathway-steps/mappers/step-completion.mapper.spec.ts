import { PathwayStepStatus } from '../../../generated/prisma/client';
import { toStepCompletionResponse } from './step-completion.mapper';

describe('toStepCompletionResponse', () => {
  const stages = [
    {
      id: 'stage-a',
      order: 1,
      steps: [
        { id: 'step-1', order: 1 },
        { id: 'step-2', order: 2 },
      ],
    },
    { id: 'stage-b', order: 2, steps: [{ id: 'step-3', order: 3 }] },
  ];
  const completedAt = new Date('2026-11-17T10:00:00.000Z');

  it('reports a completed step with overall progress, its stage progress and the next step', () => {
    const result = toStepCompletionResponse({
      stepId: 'step-1',
      completedAt,
      xpAwarded: 50,
      stages,
      userSteps: [
        { pathwayStepId: 'step-1', status: PathwayStepStatus.COMPLETED },
      ],
      startStepId: null,
    });

    expect(result).toEqual({
      stepId: 'step-1',
      status: PathwayStepStatus.COMPLETED,
      completedAt,
      progress: {
        completed: 1,
        total: 3,
        percentage: 33,
        nextStepId: 'step-2',
        selfReported: true,
      },
      stageProgress: {
        stageId: 'stage-a',
        completed: 1,
        total: 2,
        percentage: 50,
      },
      nextStepId: 'step-2',
      xpAwarded: 50,
    });
  });

  it('reports an undone step as NOT_STARTED with no completedAt', () => {
    const result = toStepCompletionResponse({
      stepId: 'step-1',
      completedAt: null,
      xpAwarded: 0,
      stages,
      userSteps: [
        { pathwayStepId: 'step-1', status: PathwayStepStatus.NOT_STARTED },
      ],
      startStepId: null,
    });

    expect(result).toMatchObject({
      status: PathwayStepStatus.NOT_STARTED,
      completedAt: null,
      nextStepId: 'step-1',
      xpAwarded: 0,
    });
  });

  it('honours the start step when picking the next step', () => {
    const result = toStepCompletionResponse({
      stepId: 'step-1',
      completedAt,
      xpAwarded: 0,
      stages,
      userSteps: [
        { pathwayStepId: 'step-1', status: PathwayStepStatus.COMPLETED },
      ],
      startStepId: 'step-3',
    });

    expect(result.nextStepId).toBe('step-3');
  });

  it('returns a null next step once every step is complete', () => {
    const result = toStepCompletionResponse({
      stepId: 'step-3',
      completedAt,
      xpAwarded: 50,
      stages,
      userSteps: ['step-1', 'step-2', 'step-3'].map((pathwayStepId) => ({
        pathwayStepId,
        status: PathwayStepStatus.COMPLETED,
      })),
      startStepId: null,
    });

    expect(result.nextStepId).toBeNull();
    expect(result.progress.percentage).toBe(100);
    expect(result.stageProgress).toEqual({
      stageId: 'stage-b',
      completed: 1,
      total: 1,
      percentage: 100,
    });
  });

  it('returns null stage progress for a step outside every stage', () => {
    const result = toStepCompletionResponse({
      stepId: 'unstaged',
      completedAt,
      xpAwarded: 50,
      stages,
      userSteps: [],
      startStepId: null,
    });

    expect(result.stageProgress).toBeNull();
  });
});
