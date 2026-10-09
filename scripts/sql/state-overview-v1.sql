-- Additive migration owned by the backend. Apply before deploying the new
-- backend/CMS clients. Existing pages need no content backfill: a null
-- "stateCities" means the default city list.
BEGIN;
ALTER TABLE "LocationPage"
  ADD COLUMN IF NOT EXISTS "citiesHeading" TEXT,
  ADD COLUMN IF NOT EXISTS "stateCities" JSONB;
COMMIT;
