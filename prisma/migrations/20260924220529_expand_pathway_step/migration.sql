ALTER TABLE "PathwayStep"
  ADD COLUMN "learningObjective" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "prerequisites" TEXT,
  ADD COLUMN "expectedActivity" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PathwayStep"
  ALTER COLUMN "learningObjective" DROP DEFAULT,
  ALTER COLUMN "expectedActivity" DROP DEFAULT;