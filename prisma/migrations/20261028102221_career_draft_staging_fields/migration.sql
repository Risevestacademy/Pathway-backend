-- AlterTable
ALTER TABLE "Career" DROP COLUMN "reviewedBy",
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "reviewedById" TEXT,
ALTER COLUMN "roleSummary" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ContentRevision" RENAME COLUMN "version" TO "baseVersion";

-- CreateIndex
CREATE INDEX "Career_publishedById_idx" ON "Career"("publishedById");

-- CreateIndex
CREATE INDEX "Career_reviewedById_idx" ON "Career"("reviewedById");

-- Case-insensitive uniqueness for Career.slug, matching Career_title_lower_key.
CREATE UNIQUE INDEX "Career_slug_lower_key" ON "Career" (lower("slug"));

-- AddForeignKey
ALTER TABLE "Career" ADD CONSTRAINT "Career_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Career" ADD CONSTRAINT "Career_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
