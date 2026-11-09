-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('STEP_COMPLETED', 'TASK_COMPLETED', 'QUIZ_PASSED');

-- CreateEnum
CREATE TYPE "FeedbackTargetType" AS ENUM ('CAREER', 'PATHWAY', 'PATHWAY_STAGE', 'PATHWAY_STEP', 'RESOURCE', 'TASK', 'OUTLOOK', 'CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackResolution" AS ENUM ('FIXED', 'NOT_AN_ISSUE');

-- AlterTable
ALTER TABLE "Career" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "ContentFeedback" ADD COLUMN     "resolution" "FeedbackResolution",
ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" "FeedbackTargetType" DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "careerInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "educationLevel" "EducationLevel",
ADD COLUMN     "experienceYears" "ExperienceYears",
ADD COLUMN     "internshipCount" "InternshipCount";

-- CreateTable
CREATE TABLE "UserCareer" (
    "userId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCareer_pkey" PRIMARY KEY ("userId","careerId")
);

-- CreateTable
CREATE TABLE "CareerResource" (
    "careerId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,

    CONSTRAINT "CareerResource_pkey" PRIMARY KEY ("careerId","resourceId")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "xpThreshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "ActivityLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCareer_careerId_idx" ON "UserCareer"("careerId");

-- CreateIndex
CREATE INDEX "CareerResource_resourceId_idx" ON "CareerResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE INDEX "ActivityLedger_userId_createdAt_idx" ON "ActivityLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLedger_userId_type_referenceId_key" ON "ActivityLedger"("userId", "type", "referenceId");

-- CreateIndex
CREATE INDEX "FeedbackNote_feedbackId_idx" ON "FeedbackNote"("feedbackId");

-- CreateIndex
CREATE INDEX "ContentFeedback_targetType_targetId_idx" ON "ContentFeedback"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "UserCareer" ADD CONSTRAINT "UserCareer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareer" ADD CONSTRAINT "UserCareer_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerResource" ADD CONSTRAINT "CareerResource_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerResource" ADD CONSTRAINT "CareerResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLedger" ADD CONSTRAINT "ActivityLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ContentFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
