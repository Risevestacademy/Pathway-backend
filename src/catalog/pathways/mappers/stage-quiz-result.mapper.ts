import type { Prisma } from '../../../generated/prisma/client';
import type { StageQuizResultDto } from '../dto/stage-quiz-result.dto';
import {
  gradeQuiz,
  type GradableQuestion,
  type QuizAnswer,
  type QuizGrade,
} from '../quiz-grading';

// Only for grading on the server. It selects correctIndex, so a row from this
// select must never be returned as it is.
export const stageQuizGradingSelect = {
  id: true,
  stageId: true,
  questions: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      prompt: true,
      correctIndex: true,
      stepId: true,
      options: {
        orderBy: { order: 'asc' },
        select: { id: true, text: true, order: true },
      },
    },
  },
} satisfies Prisma.StageQuizSelect;

export type StageQuizGradingRow = Prisma.StageQuizGetPayload<{
  select: typeof stageQuizGradingSelect;
}>;

export const toGradableQuestions = (
  quiz: StageQuizGradingRow,
): GradableQuestion[] =>
  quiz.questions.map(({ id, correctIndex, stepId, options }) => ({
    id,
    correctIndex,
    stepId,
    options: options.map(({ id: optionId, order }) => ({
      id: optionId,
      order,
    })),
  }));

// The attempt's answers column is JSON, so anything could be in it. Keep the
// entries that have the right shape and drop the rest.
export const parseStoredAnswers = (value: unknown): QuizAnswer[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry: unknown): QuizAnswer[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { questionId, optionId } = entry as Record<string, unknown>;

    return typeof questionId === 'string' && typeof optionId === 'string'
      ? [{ questionId, optionId }]
      : [];
  });
};

export const gradeStageQuiz = (
  quiz: StageQuizGradingRow,
  answers: readonly QuizAnswer[],
): QuizGrade => gradeQuiz(toGradableQuestions(quiz), answers);

/**
 * The result of one attempt: the score, the label, the step to revisit, and a
 * breakdown with the text of the chosen and the correct option for every
 * question. The score is worked out from the answers and the quiz as it is
 * now.
 */
export function toStageQuizResult(
  quiz: StageQuizGradingRow,
  grade: QuizGrade,
  submittedAt: Date,
): StageQuizResultDto {
  const textOf = (questionId: string, optionId: string | null) =>
    quiz.questions
      .find(({ id }) => id === questionId)
      ?.options.find(({ id }) => id === optionId)?.text ?? null;

  return {
    quizId: quiz.id,
    score: { correct: grade.correct, total: grade.total },
    passed: grade.passed,
    revisitStepId: grade.revisitStepId,
    breakdown: grade.results.map((result, i) => ({
      questionId: result.questionId,
      prompt: quiz.questions[i].prompt,
      selectedOptionId: result.selectedOptionId,
      selectedOptionText: textOf(result.questionId, result.selectedOptionId),
      correctOptionId: result.correctOptionId,
      correctOptionText:
        textOf(result.questionId, result.correctOptionId) ?? '',
      isCorrect: result.isCorrect,
    })),
    submittedAt,
  };
}
