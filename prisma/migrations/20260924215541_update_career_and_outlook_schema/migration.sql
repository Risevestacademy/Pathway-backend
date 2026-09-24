/*
  Warnings:

  - You are about to drop the column `category` on the `Career` table. All the data in the column will be lost.
  - You are about to drop the column `entryConsiderations` on the `Career` table. All the data in the column will be lost.
  - The `targetLevels` column on the `Career` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `demand` on the `OutlookData` table. All the data in the column will be lost.
  - You are about to drop the column `growthRate` on the `OutlookData` table. All the data in the column will be lost.
  - You are about to drop the column `salaryMax` on the `OutlookData` table. All the data in the column will be lost.
  - You are about to drop the column `salaryMin` on the `OutlookData` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Career` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fieldId` to the `Career` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Career` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `Career` required. This step will fail if there are existing NULL values in that column.
  - Made the column `roleSummary` on table `Career` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `type` to the `OutlookData` table without a default value. This is not possible if the table is not empty.
  - Made the column `source` on table `OutlookData` required. This step will fail if there are existing NULL values in that column.
  - Made the column `geography` on table `OutlookData` required. This step will fail if there are existing NULL values in that column.
  - Made the column `period` on table `OutlookData` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TargetLevel" AS ENUM ('STUDENT', 'RECENT_GRAD', 'EARLY_CAREER');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('SECONDARY_SCHOOL', 'DIPLOMA', 'BACHELOR_IN_PROGRESS', 'BACHELOR', 'MASTERS', 'OTHER');

-- CreateEnum
CREATE TYPE "InternshipCount" AS ENUM ('NONE', 'ONE', 'TWO', 'THREE_PLUS');

-- CreateEnum
CREATE TYPE "ExperienceYears" AS ENUM ('ZERO', 'UNDER_ONE', 'ONE_TO_TWO', 'THREE_PLUS');

-- CreateEnum
CREATE TYPE "OutlookType" AS ENUM ('SALARY', 'EMPLOYMENT_GROWTH', 'DEMAND');

-- CreateEnum
CREATE TYPE "Demand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- DropIndex
DROP INDEX "Career_title_key";

-- DropIndex
DROP INDEX "OutlookData_careerId_key";

-- AlterTable
ALTER TABLE "Career" DROP COLUMN "category",
DROP COLUMN "entryConsiderations",
ADD COLUMN     "certificationsNote" TEXT,
ADD COLUMN     "fieldId" TEXT NOT NULL,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "typicalEducationNote" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "roleSummary" SET NOT NULL,
DROP COLUMN "targetLevels",
ADD COLUMN     "targetLevels" "TargetLevel"[];

-- AlterTable
ALTER TABLE "OutlookData" DROP COLUMN "demand",
DROP COLUMN "growthRate",
DROP COLUMN "salaryMax",
DROP COLUMN "salaryMin",
ADD COLUMN     "baseValue" INTEGER,
ADD COLUMN     "baseYear" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "demandLevel" "Demand",
ADD COLUMN     "growthPercent" DECIMAL(5,2),
ADD COLUMN     "median" DECIMAL(15,2),
ADD COLUMN     "percentile25" DECIMAL(15,2),
ADD COLUMN     "percentile75" DECIMAL(15,2),
ADD COLUMN     "projectedValue" INTEGER,
ADD COLUMN     "projectedYear" INTEGER,
ADD COLUMN     "type" "OutlookType" NOT NULL,
ALTER COLUMN "source" SET NOT NULL,
ALTER COLUMN "geography" SET NOT NULL,
ALTER COLUMN "period" SET NOT NULL;

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Field_name_key" ON "Field"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Field_slug_key" ON "Field"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Career_slug_key" ON "Career"("slug");

-- AddForeignKey
ALTER TABLE "Career" ADD CONSTRAINT "Career_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
