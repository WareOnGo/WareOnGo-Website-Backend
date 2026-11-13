-- Careers applications stay separate from sales enquiries and CRM attribution.
BEGIN;
CREATE TABLE IF NOT EXISTS "CareerApplication" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phoneNumber" VARCHAR(30),
  "note" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CareerApplication_createdAt_id_idx" ON "CareerApplication" ("createdAt", "id");
ALTER TABLE "CareerApplication" ENABLE ROW LEVEL SECURITY;
COMMIT;
