/*
  Warnings:

  - Added the required column `curationRationale` to the `Resource` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastCheckedDate` to the `Resource` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `Resource` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ResourceCostStatus" AS ENUM ('FREE', 'PAID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "certificationCost" DECIMAL(65,30),
ADD COLUMN     "costStatus" "ResourceCostStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Resource"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "curationRationale" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastCheckedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Resource"
  ALTER COLUMN "provider" DROP DEFAULT,
  ALTER COLUMN "curationRationale" DROP DEFAULT,
  ALTER COLUMN "lastCheckedDate" DROP DEFAULT;