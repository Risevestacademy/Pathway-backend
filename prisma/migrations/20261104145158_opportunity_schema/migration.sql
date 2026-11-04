-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('INTERNSHIP', 'JOB', 'FELLOWSHIP', 'HACKATHON', 'SCHOLARSHIP', 'PROGRAMME');

-- CreateEnum
CREATE TYPE "OpportunityVerification" AS ENUM ('DRAFT', 'VERIFIED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "organisation" TEXT NOT NULL,
    "isPrivateOrg" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pay" TEXT,
    "duration" TEXT,
    "startDate" TIMESTAMP(3),
    "applyUrl" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "deadlineUnknown" BOOLEAN NOT NULL DEFAULT false,
    "verification" "OpportunityVerification" NOT NULL DEFAULT 'DRAFT',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityCareer" (
    "opportunityId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,

    CONSTRAINT "OpportunityCareer_pkey" PRIMARY KEY ("opportunityId","careerId")
);

-- CreateTable
CREATE TABLE "OpportunitySkill" (
    "opportunityId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "OpportunitySkill_pkey" PRIMARY KEY ("opportunityId","skillId")
);

-- CreateTable
CREATE TABLE "UserSavedOpportunity" (
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSavedOpportunity_pkey" PRIMARY KEY ("userId","opportunityId")
);

-- CreateIndex
CREATE INDEX "Opportunity_verification_deadline_idx" ON "Opportunity"("verification", "deadline");

-- CreateIndex
CREATE INDEX "Opportunity_type_idx" ON "Opportunity"("type");

-- CreateIndex
CREATE INDEX "Opportunity_verifiedById_idx" ON "Opportunity"("verifiedById");

-- CreateIndex
CREATE INDEX "OpportunityCareer_careerId_idx" ON "OpportunityCareer"("careerId");

-- CreateIndex
CREATE INDEX "OpportunitySkill_skillId_idx" ON "OpportunitySkill"("skillId");

-- CreateIndex
CREATE INDEX "UserSavedOpportunity_opportunityId_idx" ON "UserSavedOpportunity"("opportunityId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCareer" ADD CONSTRAINT "OpportunityCareer_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCareer" ADD CONSTRAINT "OpportunityCareer_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySkill" ADD CONSTRAINT "OpportunitySkill_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySkill" ADD CONSTRAINT "OpportunitySkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedOpportunity" ADD CONSTRAINT "UserSavedOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedOpportunity" ADD CONSTRAINT "UserSavedOpportunity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
