-- CreateEnum
CREATE TYPE "UserSkillStatus" AS ENUM ('HAVE', 'DONT_HAVE', 'NOT_SURE');

-- AlterTable
ALTER TABLE "UserSkill" ADD COLUMN     "status" "UserSkillStatus" NOT NULL DEFAULT 'NOT_SURE';
