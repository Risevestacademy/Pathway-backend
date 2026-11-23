-- AlterTable
ALTER TABLE "UserSkill" ADD COLUMN     "assessedAt" TIMESTAMP(3),
ADD COLUMN     "onProfile" BOOLEAN NOT NULL DEFAULT false;

UPDATE "UserSkill" SET "onProfile" = true, "assessedAt" = "createdAt";
