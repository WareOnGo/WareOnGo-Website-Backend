-- Additive migration owned by the backend. No service copy is seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS "ServicePage" (
  "slug" TEXT PRIMARY KEY,
  "draftContent" JSONB NOT NULL,
  "publishedContent" JSONB,
  "deployedContent" JSONB,
  "deployedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePage_slug_check" CHECK ("slug" IN (
    'warehouse-search', 'build-to-suit', 'lease-negotiation', 'compliance-procurement'
  ))
);
-- CMS and backend use the database owner. Public Supabase roles have no access.
ALTER TABLE "ServicePage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ServicePage" FROM PUBLIC;
COMMIT;
