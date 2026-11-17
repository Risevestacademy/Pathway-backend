-- AlterTable
ALTER TABLE "PathwayStepResource" ADD COLUMN     "usageNote" TEXT;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "stepId" TEXT;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "QuizQuestion_stepId_idx" ON "QuizQuestion"("stepId");

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PathwayStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
