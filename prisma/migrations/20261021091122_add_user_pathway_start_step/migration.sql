-- AlterTable
ALTER TABLE "UserPathway" ADD COLUMN     "startStepId" TEXT;

-- CreateIndex
CREATE INDEX "UserPathway_startStepId_idx" ON "UserPathway"("startStepId");

-- AddForeignKey
ALTER TABLE "UserPathway" ADD CONSTRAINT "UserPathway_startStepId_fkey" FOREIGN KEY ("startStepId") REFERENCES "PathwayStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
