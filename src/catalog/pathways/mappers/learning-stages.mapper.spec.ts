import { PathwayStepStatus } from '../../../generated/prisma/client';
import {
  type LearningStageRow,
  type LearningStepRow,
  stageQuizSelect,
  type StepMark,
  toLearningStages,
} from './learning-stages.mapper';

const completedAt = new Date('2026-11-19T10:00:00.000Z');

const stages: LearningStageRow<LearningStepRow & { extra: string }>[] = [
  {
    id: 'stage-2',
    title: 'Stage B',
    order: 2,
    quiz: { id: 'quiz-2', attempts: [{ correct: 4, total: 5 }] },
    steps: [{ id: 'step-3', title: 'Step 3', order: 3, extra: 'c' }],
  },
  {
    id: 'stage-1',
    title: 'Stage A',
    order: 1,
    quiz: null,
    steps: [
      { id: 'step-2', title: 'Step 2', order: 2, extra: 'b' },
      { id: 'step-1', title: 'Step 1', order: 1, extra: 'a' },
    ],
  },
];

const marks: StepMark[] = [
  { pathwayStepId: 'step-1', status: PathwayStepStatus.COMPLETED, completedAt },
  {
    pathwayStepId: 'step-2',
    status: PathwayStepStatus.NOT_STARTED,
    completedAt: null,
  },
];

describe('stageQuizSelect', () => {
  it("reads only the caller's best attempt", () => {
    expect(stageQuizSelect('user-1').select.attempts).toEqual({
      where: { userId: 'user-1' },
      orderBy: { correct: 'desc' },
      select: { correct: true, total: true },
      take: 1,
    });
  });
});

describe('toLearningStages', () => {
  const result = toLearningStages(stages, marks, (step) => ({
    content: step.extra,
  }));

  it('orders stages and steps', () => {
    expect(result.map(({ id }) => id)).toEqual(['stage-1', 'stage-2']);
    expect(result[0].steps.map(({ id }) => id)).toEqual(['step-1', 'step-2']);
  });

  it('counts stage progress from the step marks', () => {
    expect(result[0].progress).toEqual({
      completed: 1,
      total: 2,
      percentage: 50,
    });
  });

  it('gives each step its status, completion time and content', () => {
    expect(result[0].steps).toEqual([
      {
        id: 'step-1',
        title: 'Step 1',
        order: 1,
        status: PathwayStepStatus.COMPLETED,
        completedAt,
        content: 'a',
      },
      {
        id: 'step-2',
        title: 'Step 2',
        order: 2,
        status: PathwayStepStatus.NOT_STARTED,
        completedAt: null,
        content: 'b',
      },
    ]);
  });

  it('reports the quiz status, or null without a quiz', () => {
    expect(result[0].quiz).toBeNull();
    expect(result[1].quiz).toEqual({
      status: 'TAKEN',
      score: { correct: 4, total: 5 },
    });
  });
});
