-- Migration: move OutlookData.source/sourceUrl into a Source relation
--
-- Order matters:
--   1. Add sourceId as nullable (existing rows must not break)
--   2. Populate Source from distinct legacy (source, sourceUrl) pairs
--   3. Point OutlookData rows at their Source
--   4. Fail-fast check: no row may end up with a NULL sourceId
--   5. Only then drop the legacy columns
--   6. Add the FK constraint
--
-- Idempotency: the INSERT uses WHERE NOT EXISTS, so re-running on a
-- partially-migrated database does not create duplicates. (Source has no
-- unique constraint on (name, url), so ON CONFLICT is not available.)

-- Step 1: Add the new column (nullable for the backfill window)
ALTER TABLE "OutlookData" ADD COLUMN "sourceId" TEXT;

-- Step 2: Insert one Source per distinct (source, sourceUrl) pair
INSERT INTO "Source" ("id", "name", "url", "lastCheckedAt", "verifiedById")
SELECT
  gen_random_uuid()::text,
  pairs."source",
  pairs."sourceUrl",
  NULL,
  NULL
FROM (
  SELECT DISTINCT "source", "sourceUrl"
  FROM "OutlookData"
) AS pairs
WHERE NOT EXISTS (
  SELECT 1
  FROM "Source" s
  WHERE s."name" = pairs."source"
    AND (
      (s."url" = pairs."sourceUrl")
      OR (s."url" IS NULL AND pairs."sourceUrl" IS NULL)
    )
);

-- Step 3: Backfill sourceId by matching (source, sourceUrl) -> (name, url)
-- NULL handling: SQL equality never matches NULL to NULL, so the
-- second branch of the OR is required for the three sources that have
-- no URL.
UPDATE "OutlookData" od
SET "sourceId" = s."id"
FROM "Source" s
WHERE od."source" = s."name"
  AND (
    (od."sourceUrl" = s."url")
    OR (od."sourceUrl" IS NULL AND s."url" IS NULL)
  );

-- Step 4: Fail-fast — abort before dropping columns if any row didn't migrate
DO $$
DECLARE
  unmigrated INT;
BEGIN
  SELECT COUNT(*) INTO unmigrated FROM "OutlookData" WHERE "sourceId" IS NULL;
  IF unmigrated > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % OutlookData rows still have NULL sourceId',
      unmigrated;
  END IF;
END $$;

-- Step 5: Drop the legacy columns (safe now that provenance is preserved)
ALTER TABLE "OutlookData" DROP COLUMN "source";
ALTER TABLE "OutlookData" DROP COLUMN "sourceUrl";

-- Step 6: Add the foreign key constraint
ALTER TABLE "OutlookData"
  ADD CONSTRAINT "OutlookData_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;