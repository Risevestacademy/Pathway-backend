import {
  gradeQuiz,
  isPassingScore,
  QUIZ_PASS_MARK,
  type GradableQuestion,
  type QuizAnswer,
} from './quiz-grading';

describe('gradeQuiz', () => {
  // Five questions with four options each. The correct option moves around.
  const questions: GradableQuestion[] = [0, 1, 2, 3, 0].map(
    (correctIndex, i) => ({
      id: `q${i + 1}`,
      correctIndex,
      options: [0, 1, 2, 3].map((order) => ({
        id: `q${i + 1}-o${order}`,
        order,
      })),
    }),
  );

  const correctAnswers = (): QuizAnswer[] =>
    questions.map(({ id, correctIndex }) => ({
      questionId: id,
      optionId: `${id}-o${correctIndex}`,
    }));

  const wrongAnswer = (
    questionId: string,
    correctIndex: number,
  ): QuizAnswer => ({
    questionId,
    optionId: `${questionId}-o${(correctIndex + 1) % 4}`,
  });

  it('scores every question right', () => {
    const grade = gradeQuiz(questions, correctAnswers());

    expect(grade).toMatchObject({ correct: 5, total: 5, passed: true });
    expect(grade.results.every(({ isCorrect }) => isCorrect)).toBe(true);
  });

  it('scores no question right', () => {
    const answers = questions.map(({ id, correctIndex }) =>
      wrongAnswer(id, correctIndex),
    );

    const grade = gradeQuiz(questions, answers);

    expect(grade).toMatchObject({ correct: 0, total: 5, passed: false });
    expect(grade.results.some(({ isCorrect }) => isCorrect)).toBe(false);
  });

  it('returns one result per question, in question order, with the correct option', () => {
    const grade = gradeQuiz(questions, correctAnswers());

    expect(grade.results.map(({ questionId }) => questionId)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
    ]);
    expect(grade.results[3]).toEqual({
      questionId: 'q4',
      selectedOptionId: 'q4-o3',
      correctOptionId: 'q4-o3',
      isCorrect: true,
    });
  });

  it('counts a missing answer as wrong, with no selected option', () => {
    const answers = correctAnswers().filter(
      ({ questionId }) => questionId !== 'q2',
    );

    const grade = gradeQuiz(questions, answers);

    expect(grade.correct).toBe(4);
    expect(grade.results[1]).toEqual({
      questionId: 'q2',
      selectedOptionId: null,
      correctOptionId: 'q2-o1',
      isCorrect: false,
    });
  });

  it('counts no answers at all as zero', () => {
    expect(gradeQuiz(questions, [])).toMatchObject({
      correct: 0,
      total: 5,
      passed: false,
    });
  });

  it("counts an option from another question as wrong, even if it is that question's correct one", () => {
    // q1-o0 is correct for q1, but is sent as the answer to q2
    const answers = correctAnswers().map((answer) =>
      answer.questionId === 'q2'
        ? { questionId: 'q2', optionId: 'q1-o0' }
        : answer,
    );

    const grade = gradeQuiz(questions, answers);

    expect(grade.correct).toBe(4);
    expect(grade.results[1]).toMatchObject({
      selectedOptionId: null,
      isCorrect: false,
    });
  });

  it('counts an option id that exists nowhere as wrong', () => {
    const answers = [
      ...correctAnswers().slice(1),
      { questionId: 'q1', optionId: 'not-an-option' },
    ];

    const grade = gradeQuiz(questions, answers);

    expect(grade.correct).toBe(4);
    expect(grade.results[0].selectedOptionId).toBeNull();
  });

  it('uses the first answer sent for a question', () => {
    const answers = [
      wrongAnswer('q1', 0),
      { questionId: 'q1', optionId: 'q1-o0' },
      ...correctAnswers().slice(1),
    ];

    const grade = gradeQuiz(questions, answers);

    expect(grade.correct).toBe(4);
    expect(grade.results[0].isCorrect).toBe(false);
  });

  it('ignores answers to questions that are not in the quiz', () => {
    const grade = gradeQuiz(questions, [
      ...correctAnswers(),
      { questionId: 'other', optionId: 'other-o0' },
    ]);

    expect(grade).toMatchObject({ correct: 5, total: 5 });
    expect(grade.results).toHaveLength(5);
  });

  it('does not change its inputs', () => {
    const answers = correctAnswers();
    const questionsBefore = JSON.stringify(questions);
    const answersBefore = JSON.stringify(answers);

    gradeQuiz(questions, answers);

    expect(JSON.stringify(questions)).toBe(questionsBefore);
    expect(JSON.stringify(answers)).toBe(answersBefore);
  });

  it('is the same for the same inputs', () => {
    expect(gradeQuiz(questions, correctAnswers())).toEqual(
      gradeQuiz(questions, correctAnswers()),
    );
  });

  it('throws when a question has no option at its correctIndex', () => {
    const broken: GradableQuestion[] = [
      { id: 'q1', correctIndex: 3, options: [{ id: 'q1-o0', order: 0 }] },
    ];

    expect(() => gradeQuiz(broken, [])).toThrow('q1');
  });

  describe('pass mark boundary', () => {
    const withCorrect = (count: number): QuizAnswer[] =>
      questions.map(({ id, correctIndex }, i) =>
        i < count
          ? { questionId: id, optionId: `${id}-o${correctIndex}` }
          : wrongAnswer(id, correctIndex),
      );

    it('passes at exactly the pass mark', () => {
      expect(gradeQuiz(questions, withCorrect(QUIZ_PASS_MARK)).passed).toBe(
        true,
      );
    });

    it('fails one below the pass mark', () => {
      expect(gradeQuiz(questions, withCorrect(QUIZ_PASS_MARK - 1)).passed).toBe(
        false,
      );
    });

    it('exposes the same rule as isPassingScore', () => {
      expect(isPassingScore(QUIZ_PASS_MARK)).toBe(true);
      expect(isPassingScore(QUIZ_PASS_MARK - 1)).toBe(false);
    });
  });
});
