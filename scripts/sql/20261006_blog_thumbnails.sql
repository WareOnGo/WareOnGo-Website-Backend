-- Apply before deploying the backend and CMS clients that select this column.
-- Existing posts keep using the site's default thumbnails until an upload is saved.
ALTER TABLE "Blog" ADD COLUMN IF NOT EXISTS "thumbnail" JSONB;
