-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FEEDBACK_REPLIED', 'FEEDBACK_RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ROADMAP_UPDATES', 'NEW_OPENINGS', 'FEEDBACK_REPLIES', 'RESOURCE_LINK_PROBLEMS', 'LEARNING_REMINDERS', 'STREAK_NUDGES');

-- CreateEnum
CREATE TYPE "NotificationTargetType" AS ENUM ('CAREER', 'PATHWAY', 'PATHWAY_STAGE', 'PATHWAY_STEP', 'RESOURCE', 'TASK', 'OPPORTUNITY', 'FEEDBACK', 'OTHER');

-- AlterTable
ALTER TABLE "ContentFeedback" ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "targetType" "NotificationTargetType",
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_targetType_targetId_idx" ON "Notification"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "ContentFeedback_submittedById_idx" ON "ContentFeedback"("submittedById");

-- AddForeignKey
ALTER TABLE "ContentFeedback" ADD CONSTRAINT "ContentFeedback_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
