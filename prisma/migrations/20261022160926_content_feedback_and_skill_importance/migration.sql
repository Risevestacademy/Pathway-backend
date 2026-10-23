-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('INCORRECT_CONTENT', 'BROKEN_LINK', 'USABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackSection" AS ENUM ('CAREER_DETAILS', 'OUTLOOK', 'PATHWAY', 'RESOURCES', 'GENERAL');

-- CreateEnum
CREATE TYPE "FeedbackPlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "SkillImportance" AS ENUM ('REQUIRED', 'NICE_TO_HAVE');

-- AlterTable
ALTER TABLE "CareerSkill" ADD COLUMN     "importance" "SkillImportance" NOT NULL DEFAULT 'REQUIRED';

-- CreateTable
CREATE TABLE "ContentFeedback" (
    "id" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "section" "FeedbackSection" NOT NULL DEFAULT 'GENERAL',
    "careerId" TEXT,
    "description" TEXT NOT NULL,
    "userEmail" TEXT,
    "platform" "FeedbackPlatform",
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentFeedback_careerId_idx" ON "ContentFeedback"("careerId");

-- CreateIndex
CREATE INDEX "ContentFeedback_status_idx" ON "ContentFeedback"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Career_title_key" ON "Career"("title");

-- AddForeignKey
ALTER TABLE "ContentFeedback" ADD CONSTRAINT "ContentFeedback_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE SET NULL ON UPDATE CASCADE;

