import { PathwayStepStatus } from '../../../generated/prisma/client';
import type { StepMark } from './learning-stages.mapper';
import {
  type PathwayProgressStageRow,
  toPathwayProgress,
} from './pathway-progress.mapper';

const stages: PathwayProgressStageRow[] = [
  {
    id: 'stage-2',
    title: 'Stage B',
    order: 2,
    quiz: null,
    steps: [{ id: 'step-3', title: 'Step 3', order: 3 }],
  },
  {
    id: 'stage-1',
    title: 'Stage A',
    order: 1,
    quiz: { id: 'quiz-1', attempts: [{ correct: 4, total: 5 }] },
    steps: [
      { id: 'step-1', title: 'Step 1', order: 1 },
      { id: 'step-2', title: 'Step 2', order: 2 },
    ],
  },
];

const stageA = { id: 'stage-1', title: 'Stage A', order: 1 };
const stageB = { id: 'stage-2', title: 'Stage B', order: 2 };

const completed = (pathwayStepId: string, completedAt: string): StepMark => ({
  pathwayStepId,
  status: PathwayStepStatus.COMPLETED,
  completedAt: new Date(completedAt),
});

describe('toPathwayProgress', () => {
  it('lists completed steps newest first, with their stage', () => {
    const result = toPathwayProgress(
      'pathway-1',
      stages,
      [
        completed('step-1', '2026-11-18T10:00:00.000Z'),
        completed('step-3', '2026-11-19T10:00:00.000Z'),
      ],
      null,
    );

    expect(result.completedSteps).toEqual([
      {
        id: 'step-3',
        title: 'Step 3',
        order: 3,
        completedAt: new Date('2026-11-19T10:00:00.000Z'),
        stage: stageB,
      },
      {
        id: 'step-1',
        title: 'Step 1',
        order: 1,
        completedAt: new Date('2026-11-18T10:00:00.000Z'),
        stage: stageA,
      },
    ]);
    expect(result.progress).toEqual({
      completed: 2,
      total: 3,
      percentage: 67,
      selfReported: true,
    });
    expect(result.nextStep).toEqual({
      id: 'step-2',
      title: 'Step 2',
      order: 2,
      stage: stageA,
    });
  });

  it('puts a completed step without a completion time last', () => {
    const result = toPathwayProgress(
      'pathway-1',
      stages,
      [
        {
          pathwayStepId: 'step-2',
          status: PathwayStepStatus.COMPLETED,
          completedAt: null,
        },
        completed('step-1', '2026-11-18T10:00:00.000Z'),
      ],
      null,
    );

    expect(result.completedSteps.map(({ id }) => id)).toEqual([
      'step-1',
      'step-2',
    ]);
  });

  it('returns zero progress and the first step for a new user', () => {
    const result = toPathwayProgress('pathway-1', stages, [], null);

    expect(result.progress).toEqual({
      completed: 0,
      total: 3,
      percentage: 0,
      selfReported: true,
    });
    expect(result.completedSteps).toEqual([]);
    expect(result.nextStep).toMatchObject({ id: 'step-1', stage: stageA });
  });

  it('starts the next step at the start pointer', () => {
    const result = toPathwayProgress('pathway-1', stages, [], 'step-3');

    expect(result.nextStep).toMatchObject({ id: 'step-3', stage: stageB });
  });

  it('returns no next step when everything is complete', () => {
    const result = toPathwayProgress(
      'pathway-1',
      stages,
      [
        completed('step-1', '2026-11-17T10:00:00.000Z'),
        completed('step-2', '2026-11-18T10:00:00.000Z'),
        completed('step-3', '2026-11-19T10:00:00.000Z'),
      ],
      null,
    );

    expect(result.progress.percentage).toBe(100);
    expect(result.nextStep).toBeNull();
  });

  it('summarises each stage without its steps', () => {
    const result = toPathwayProgress(
      'pathway-1',
      stages,
      [completed('step-1', '2026-11-18T10:00:00.000Z')],
      null,
    );

    expect(result.stages).toEqual([
      {
        ...stageA,
        progress: { completed: 1, total: 2, percentage: 50 },
        quiz: { status: 'TAKEN', score: { correct: 4, total: 5 } },
      },
      {
        ...stageB,
        progress: { completed: 0, total: 1, percentage: 0 },
        quiz: null,
      },
    ]);
  });
});
