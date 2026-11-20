// Correct answers needed to pass. Value still to confirm with product.
// It only decides the "passed" label: it never affects XP or stage completion.
export const QUIZ_PASS_MARK = 4;

export interface GradableOption {
  id: string;
  order: number;
}

export interface GradableQuestion {
  id: string;
  correctIndex: number;
  options: GradableOption[];
}

export interface QuizAnswer {
  questionId: string;
  optionId: string;
}

export interface QuestionResult {
  questionId: string;
  // Null when the question was not answered, or the option sent is not one of
  // this question's options
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
}

export interface QuizGrade {
  correct: number;
  total: number;
  passed: boolean;
  results: QuestionResult[];
}

export const isPassingScore = (correct: number): boolean =>
  correct >= QUIZ_PASS_MARK;

/**
 * Grades a submission. One result per question, in the order given. A missing
 * answer, or an option that belongs to another question, is wrong. The first
 * answer sent for a question counts, and answers to unknown questions are
 * ignored. Nothing is read or written outside the arguments.
 */
export function gradeQuiz(
  questions: readonly GradableQuestion[],
  answers: readonly QuizAnswer[],
): QuizGrade {
  const answerByQuestion = new Map<string, string>();
  for (const { questionId, optionId } of answers) {
    if (!answerByQuestion.has(questionId)) {
      answerByQuestion.set(questionId, optionId);
    }
  }

  const results = questions.map((question): QuestionResult => {
    const correctOption = question.options.find(
      ({ order }) => order === question.correctIndex,
    );
    if (!correctOption) {
      throw new Error(`Question ${question.id} has no correct option`);
    }

    const sent = answerByQuestion.get(question.id);
    const selected = question.options.find(({ id }) => id === sent);

    return {
      questionId: question.id,
      selectedOptionId: selected?.id ?? null,
      correctOptionId: correctOption.id,
      isCorrect: selected?.id === correctOption.id,
    };
  });

  const correct = results.filter(({ isCorrect }) => isCorrect).length;

  return {
    correct,
    total: questions.length,
    passed: isPassingScore(correct),
    results,
  };
}
