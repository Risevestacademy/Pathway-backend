import {
  parseStoredAnswers,
  toGradableQuestions,
  toStageQuizResult,
  gradeStageQuiz,
  type StageQuizGradingRow,
} from './stage-quiz-result.mapper';

describe('stage quiz result mapper', () => {
  const quiz: StageQuizGradingRow = {
    id: 'quiz-1',
    stageId: 'stage-1',
    questions: [
      {
        id: 'q1',
        prompt: 'First?',
        correctIndex: 1,
        stepId: 'step-1',
        options: ['A', 'B', 'C', 'D'].map((text, order) => ({
          id: `q1-o${order}`,
          text,
          order,
        })),
      },
      {
        id: 'q2',
        prompt: 'Second?',
        correctIndex: 3,
        stepId: null,
        options: ['A', 'B', 'C', 'D'].map((text, order) => ({
          id: `q2-o${order}`,
          text,
          order,
        })),
      },
    ],
  };
  const submittedAt = new Date('2026-11-20T10:00:00.000Z');

  it('maps a row to gradable questions', () => {
    expect(toGradableQuestions(quiz)[0]).toEqual({
      id: 'q1',
      correctIndex: 1,
      stepId: 'step-1',
      options: [
        { id: 'q1-o0', order: 0 },
        { id: 'q1-o1', order: 1 },
        { id: 'q1-o2', order: 2 },
        { id: 'q1-o3', order: 3 },
      ],
    });
  });

  it('builds a breakdown with the answer texts, in question order', () => {
    const grade = gradeStageQuiz(quiz, [
      { questionId: 'q1', optionId: 'q1-o0' },
      { questionId: 'q2', optionId: 'q2-o3' },
    ]);

    const result = toStageQuizResult(quiz, grade, submittedAt);

    expect(result).toEqual({
      quizId: 'quiz-1',
      score: { correct: 1, total: 2 },
      passed: false,
      revisitStepId: 'step-1',
      submittedAt,
      breakdown: [
        {
          questionId: 'q1',
          prompt: 'First?',
          selectedOptionId: 'q1-o0',
          selectedOptionText: 'A',
          correctOptionId: 'q1-o1',
          correctOptionText: 'B',
          isCorrect: false,
        },
        {
          questionId: 'q2',
          prompt: 'Second?',
          selectedOptionId: 'q2-o3',
          selectedOptionText: 'D',
          correctOptionId: 'q2-o3',
          correctOptionText: 'D',
          isCorrect: true,
        },
      ],
    });
  });

  it('has null selected text for a question left unanswered', () => {
    const grade = gradeStageQuiz(quiz, [
      { questionId: 'q2', optionId: 'q2-o3' },
    ]);

    const [first] = toStageQuizResult(quiz, grade, submittedAt).breakdown;

    expect(first).toMatchObject({
      selectedOptionId: null,
      selectedOptionText: null,
      isCorrect: false,
    });
  });

  it('has no XP field', () => {
    const result = toStageQuizResult(
      quiz,
      gradeStageQuiz(quiz, []),
      submittedAt,
    );

    expect(result).not.toHaveProperty('xpAwarded');
  });

  describe('parseStoredAnswers', () => {
    it('keeps well-formed answers', () => {
      expect(
        parseStoredAnswers([{ questionId: 'q1', optionId: 'o1' }]),
      ).toEqual([{ questionId: 'q1', optionId: 'o1' }]);
    });

    it.each([
      ['null', null],
      ['an object', {}],
      ['a string', 'x'],
      ['an empty array', []],
    ])('returns an empty list for %s', (_label, value) => {
      expect(parseStoredAnswers(value)).toEqual([]);
    });

    it('drops entries with the wrong shape and extra keys', () => {
      expect(
        parseStoredAnswers([
          { questionId: 'q1', optionId: 'o1', extra: true },
          { questionId: 'q2' },
          { questionId: 1, optionId: 'o3' },
          null,
          'x',
        ]),
      ).toEqual([{ questionId: 'q1', optionId: 'o1' }]);
    });
  });
});
