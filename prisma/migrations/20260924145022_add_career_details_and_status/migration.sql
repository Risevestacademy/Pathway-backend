-- CreateEnum
CREATE TYPE "CareerStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- AlterTable
ALTER TABLE "Career" ADD COLUMN     "entryConsiderations" TEXT,
ADD COLUMN     "exampleActivities" TEXT[],
ADD COLUMN     "roleSummary" TEXT,
ADD COLUMN     "status" "CareerStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "targetLevels" TEXT[];
