-- DropIndex
DROP INDEX IF EXISTS "RefreshToken_userId_idx";

-- CreateIndex
CREATE INDEX "RefreshToken_userId_tokenHash_idx" ON "RefreshToken"("userId", "tokenHash");
