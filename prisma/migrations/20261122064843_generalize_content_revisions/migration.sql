/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,contentType,contentId]` on the table `ContentRevision` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contentId` to the `ContentRevision` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contentType` to the `ContentRevision` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('CAREER', 'PATHWAY', 'PATHWAY_STAGE', 'PATHWAY_STEP', 'PATHWAY_STEP_TASK', 'RESOURCE', 'SKILL', 'OUTLOOK', 'SOURCE', 'STAGE_QUIZ', 'QUIZ_QUESTION');

-- AlterEnum
ALTER TYPE "ReviewDecision" ADD VALUE 'CHANGES_REQUESTED';

-- AlterEnum
ALTER TYPE "RevisionStatus" ADD VALUE 'CHANGES_REQUESTED';

-- ─── MANUAL EDIT 1: add pgcrypto for gen_random_uuid (Postgres < 13 only) ───
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "ContentRevision" ADD COLUMN     "contentId" TEXT NOT NULL,
ADD COLUMN     "contentType" "ContentType",
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sessionId" TEXT;

UPDATE "ContentRevision" SET "contentType" = 'CAREER', "contentId" = "careerId";
ALTER TABLE "ContentRevision"
  ALTER COLUMN "contentType" SET NOT NULL,
  ALTER COLUMN "contentId"   SET NOT NULL;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "sessionId" TEXT,
ALTER COLUMN "revisionId" DROP NOT NULL;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_revision_or_session_exclusive"
  CHECK (
    ("revisionId" IS NOT NULL AND "sessionId" IS NULL)
    OR
    ("revisionId" IS NULL AND "sessionId" IS NOT NULL)
  );

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RevisionSession" (
    "id" TEXT NOT NULL,
    "contextType" "ContentType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "RevisionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRevisionPublishEvent" (
    "id" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRevisionPublishEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ContentRevisionPublishEvent"
  ("id", "contentType", "contentId", "revisionId", "publishedAt")
SELECT
  gen_random_uuid()::text,
  'CAREER',
  cr."careerId",
  cr."id",
  COALESCE(c."publishedAt", cr."updatedAt")
FROM "ContentRevision" cr
LEFT JOIN "Career" c ON c."id" = cr."careerId"
WHERE cr."status" = 'PUBLISHED';

-- CreateIndex
CREATE INDEX "RevisionSession_contextType_contextId_status_idx" ON "RevisionSession"("contextType", "contextId", "status");

-- CreateIndex
CREATE INDEX "RevisionSession_createdById_idx" ON "RevisionSession"("createdById");

-- CreateIndex
CREATE INDEX "ContentRevisionPublishEvent_contentType_contentId_published_idx" ON "ContentRevisionPublishEvent"("contentType", "contentId", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentRevision_contentType_contentId_status_idx" ON "ContentRevision"("contentType", "contentId", "status");

-- CreateIndex
CREATE INDEX "ContentRevision_sessionId_idx" ON "ContentRevision"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRevision_sessionId_contentType_contentId_key" ON "ContentRevision"("sessionId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "Review_sessionId_idx" ON "Review"("sessionId");

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RevisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionSession" ADD CONSTRAINT "RevisionSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevisionPublishEvent" ADD CONSTRAINT "ContentRevisionPublishEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ContentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RevisionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Source" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "QuizQuestion" ALTER COLUMN "updatedAt" DROP DEFAULT;