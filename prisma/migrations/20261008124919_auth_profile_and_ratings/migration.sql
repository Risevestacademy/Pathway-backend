-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

-- AlterTable
ALTER TABLE "AssessmentResponse" ALTER COLUMN "rating" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserSkill" ALTER COLUMN "rating" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserSkillProgress" ALTER COLUMN "rating" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "AuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "Career_fieldId_idx" ON "Career"("fieldId");

-- CreateIndex
CREATE INDEX "CareerSkill_skillId_idx" ON "CareerSkill"("skillId");

-- CreateIndex
CREATE INDEX "OutlookData_careerId_idx" ON "OutlookData"("careerId");

-- CreateIndex
CREATE INDEX "PathwayStepResource_resourceId_idx" ON "PathwayStepResource"("resourceId");

-- CreateIndex
CREATE INDEX "PathwayStepSkill_skillId_idx" ON "PathwayStepSkill"("skillId");

-- CreateIndex
CREATE INDEX "ResourceSkill_skillId_idx" ON "ResourceSkill"("skillId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5);

ALTER TABLE "UserSkillProgress" ADD CONSTRAINT "UserSkillProgress_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5);

ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5);

CREATE UNIQUE INDEX "UserPathway_userId_active_key" ON "UserPathway"("userId") WHERE "isActive" = true;
