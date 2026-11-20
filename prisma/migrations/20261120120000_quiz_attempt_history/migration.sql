-- A user can now submit a quiz more than once, and every attempt is kept.

-- DropIndex
DROP INDEX "QuizAttempt_userId_stageQuizId_key";

-- AlterTable
-- Attempts stored before this change have no answers, so they get an empty list.
ALTER TABLE "QuizAttempt" ADD COLUMN "answers" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_stageQuizId_submittedAt_idx" ON "QuizAttempt"("userId", "stageQuizId", "submittedAt");