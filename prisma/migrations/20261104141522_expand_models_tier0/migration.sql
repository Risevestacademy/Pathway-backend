-- AlterTable
ALTER TABLE "PathwayStep" ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "badgeImageUrl" TEXT,
ADD COLUMN     "estimatedWeeks" INTEGER;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "learningGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weeklyTimeCommitment" TEXT;

-- CreateTable
CREATE TABLE "PathwayStage" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayStepTask" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "estimatedWeeks" INTEGER,
    "order" INTEGER NOT NULL,
    "whatToMake" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayStepTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayTaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PathwayTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayTaskResource" (
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PathwayTaskResource_pkey" PRIMARY KEY ("taskId","resourceId")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTaskChecklistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserResourceCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserResourceCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PathwayStage_pathwayId_order_key" ON "PathwayStage"("pathwayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayStepTask_stepId_order_key" ON "PathwayStepTask"("stepId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayTaskChecklistItem_taskId_order_key" ON "PathwayTaskChecklistItem"("taskId", "order");

-- CreateIndex
CREATE INDEX "PathwayTaskResource_resourceId_idx" ON "PathwayTaskResource"("resourceId");

-- CreateIndex
CREATE INDEX "UserTask_taskId_idx" ON "UserTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTask_userId_taskId_key" ON "UserTask"("userId", "taskId");

-- CreateIndex
CREATE INDEX "UserTaskChecklistItem_checklistItemId_idx" ON "UserTaskChecklistItem"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTaskChecklistItem_userId_checklistItemId_key" ON "UserTaskChecklistItem"("userId", "checklistItemId");

-- CreateIndex
CREATE INDEX "UserResourceCompletion_resourceId_idx" ON "UserResourceCompletion"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserResourceCompletion_userId_resourceId_key" ON "UserResourceCompletion"("userId", "resourceId");

-- CreateIndex
CREATE INDEX "PathwayStep_stageId_idx" ON "PathwayStep"("stageId");

-- AddForeignKey
ALTER TABLE "PathwayStage" ADD CONSTRAINT "PathwayStage_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "Pathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayStep" ADD CONSTRAINT "PathwayStep_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PathwayStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayStepTask" ADD CONSTRAINT "PathwayStepTask_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PathwayStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayTaskChecklistItem" ADD CONSTRAINT "PathwayTaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PathwayStepTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayTaskResource" ADD CONSTRAINT "PathwayTaskResource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PathwayStepTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayTaskResource" ADD CONSTRAINT "PathwayTaskResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PathwayStepTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskChecklistItem" ADD CONSTRAINT "UserTaskChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskChecklistItem" ADD CONSTRAINT "UserTaskChecklistItem_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "PathwayTaskChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResourceCompletion" ADD CONSTRAINT "UserResourceCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResourceCompletion" ADD CONSTRAINT "UserResourceCompletion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
