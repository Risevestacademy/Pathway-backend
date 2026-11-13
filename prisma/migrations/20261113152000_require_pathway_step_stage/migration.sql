
-- Stage description (nullable; shown on roadmap cards in the design)
ALTER TABLE "PathwayStage" ADD COLUMN "description" TEXT;

-- Every step must belong to a stage
ALTER TABLE "PathwayStep" ALTER COLUMN "stageId" SET NOT NULL;

-- Stage delete is blocked while it has steps
-- NO ACTION allows cascading deletion through the parent pathway
ALTER TABLE "PathwayStep" DROP CONSTRAINT "PathwayStep_stageId_fkey";

ALTER TABLE "PathwayStep" ADD CONSTRAINT "PathwayStep_stageId_fkey"
  FOREIGN KEY ("stageId")
  REFERENCES "PathwayStage"("id")
  ON DELETE NO ACTION
  ON UPDATE CASCADE;
