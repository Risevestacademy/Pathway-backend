-- Case-insensitive uniqueness for Career.title.
-- Prisma cannot express expression indexes in schema.prisma, so this is raw SQL.
CREATE UNIQUE INDEX "Career_title_lower_key" ON "Career" (lower("title"));
