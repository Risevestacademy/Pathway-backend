/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Badge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Badge" DROP COLUMN "imageUrl",
ADD COLUMN     "iconKey" TEXT;

-- AlterTable
ALTER TABLE "Career" ADD COLUMN     "iconKey" TEXT;
