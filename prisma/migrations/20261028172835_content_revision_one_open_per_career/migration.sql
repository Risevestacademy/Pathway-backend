-- At most one open (DRAFT or IN_REVIEW) revision per career.
-- Prisma cannot express partial indexes in schema.prisma, so this is raw SQL.
CREATE UNIQUE INDEX "ContentRevision_careerId_open_key" ON "ContentRevision" ("careerId")
WHERE "status" IN ('DRAFT', 'IN_REVIEW');
