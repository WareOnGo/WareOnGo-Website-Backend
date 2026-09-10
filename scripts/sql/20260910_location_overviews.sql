-- City and state CMS overviews. Run once in Supabase SQL Editor before deploying.
-- Additive and safe to re-run; existing MicromarketPage content stays in its table.
BEGIN;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."LocationPageKind" AS ENUM ('CITY', 'STATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."LocationPage" (
    "id" SERIAL NOT NULL,
    "kind" "public"."LocationPageKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seoTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "h1" TEXT NOT NULL,
    "heroEyebrow" TEXT,
    "heroProse" TEXT NOT NULL,
    "heroImage" JSONB,
    "marketHeading" TEXT,
    "marketProse" TEXT,
    "marketImage" JSONB,
    "rentsHeading" TEXT,
    "rentsProse" TEXT,
    "specHeading" TEXT,
    "specProse" TEXT,
    "inventoryHeading" TEXT,
    "faqs" JSONB NOT NULL,
    "relatedBlogs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statOverrides" JSONB,
    "status" "public"."MicromarketPageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deployedAt" TIMESTAMP(3),
    "deployedContent" JSONB,

    CONSTRAINT "LocationPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocationPage_status_idx" ON "public"."LocationPage"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LocationPage_kind_slug_key" ON "public"."LocationPage"("kind", "slug");

ALTER TABLE "public"."LocationPage" ENABLE ROW LEVEL SECURITY;

COMMIT;
