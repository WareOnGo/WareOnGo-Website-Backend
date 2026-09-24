-- Additive migration owned by the backend. Apply before deploying the new
-- backend/CMS clients. Existing pages need no content backfill.
BEGIN;
ALTER TABLE "LocationPage"
  ADD COLUMN IF NOT EXISTS "corridorHeading" TEXT,
  ADD COLUMN IF NOT EXISTS "corridorProse" TEXT,
  ADD COLUMN IF NOT EXISTS "complianceHeading" TEXT,
  ADD COLUMN IF NOT EXISTS "complianceProse" TEXT;
COMMIT;
