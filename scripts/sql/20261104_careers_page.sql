-- Additive migration only. The CMS offers sample content on first edit;
-- no sample vacancies are approved or published by applying this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS "CareersPage" (
  "slug" TEXT PRIMARY KEY CHECK ("slug" = 'careers'),
  "draftContent" JSONB NOT NULL,
  "publishedContent" JSONB,
  "deployedContent" JSONB,
  "deployedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "CareersPage" ENABLE ROW LEVEL SECURITY;
COMMIT;
