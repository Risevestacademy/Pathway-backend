-- DropForeignKey
ALTER TABLE "PathwayStep" DROP CONSTRAINT "PathwayStep_stageId_fkey";

-- AlterTable
ALTER TABLE "PathwayStep" ALTER COLUMN "stageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PathwayStep" ADD CONSTRAINT "PathwayStep_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PathwayStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
