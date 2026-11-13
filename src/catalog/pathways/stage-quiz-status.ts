import type {
  StageQuizStatusTaken,
  StageQuizStatusNotTaken,
} from './dto/stage-quiz-status.dto';

export type StageQuizStatus = StageQuizStatusNotTaken | StageQuizStatusTaken;

export interface QuizAttemptSummary {
  correct: number;
  total: number;
}

/**
 * Pure function: given whether the stage has a quiz and whether this user
 * has attempted it, return the quiz status for the pathway read.
 *
 * - No quiz on the stage → null (callers omit the `quiz` field)
 * - Quiz exists, no attempt → { status: 'NOT_TAKEN' }
 * - Quiz exists, attempt recorded → { status: 'TAKEN', score: { correct, total } }
 */
export function toStageQuizStatus(
  quiz: { id: string } | null,
  attempt: QuizAttemptSummary | null,
): StageQuizStatus | null {
  if (!quiz) return null;
  if (!attempt) return { status: 'NOT_TAKEN' };
  return {
    status: 'TAKEN',
    score: { correct: attempt.correct, total: attempt.total },
  };
}
