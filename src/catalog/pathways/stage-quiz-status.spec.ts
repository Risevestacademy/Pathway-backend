import { toStageQuizStatus } from './stage-quiz-status';

describe('toStageQuizStatus', () => {
  it('returns null when the stage has no quiz', () => {
    expect(toStageQuizStatus(null, null)).toBeNull();
  });

  it('returns NOT_TAKEN when the stage has a quiz and no attempt', () => {
    expect(toStageQuizStatus({ id: 'quiz-1' }, null)).toEqual({
      status: 'NOT_TAKEN',
    });
  });

  it('returns TAKEN with score when an attempt exists', () => {
    expect(
      toStageQuizStatus({ id: 'quiz-1' }, { correct: 4, total: 5 }),
    ).toEqual({
      status: 'TAKEN',
      score: { correct: 4, total: 5 },
    });
  });

  it('handles a perfect score', () => {
    expect(
      toStageQuizStatus({ id: 'quiz-1' }, { correct: 5, total: 5 }),
    ).toEqual({
      status: 'TAKEN',
      score: { correct: 5, total: 5 },
    });
  });

  it('handles a zero score (quiz taken, nothing right)', () => {
    expect(
      toStageQuizStatus({ id: 'quiz-1' }, { correct: 0, total: 5 }),
    ).toEqual({
      status: 'TAKEN',
      score: { correct: 0, total: 5 },
    });
  });
});
