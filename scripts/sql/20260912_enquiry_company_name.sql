-- Run before deploying the updated backend. Existing enquiries and general
-- contact forms can keep NULL; warehouse enquiries are validated by the API.
ALTER TABLE "public"."Enquiry"
  ADD COLUMN IF NOT EXISTS "company_name" TEXT;
