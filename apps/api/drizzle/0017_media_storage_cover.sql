-- B-76: Bilder optional in Object Storage (Supabase S3) statt in PostgreSQL; Titelbild im Profil.
-- Handgeschrieben und idempotent (IF NOT EXISTS), damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "media" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "storage_key" text;
DO $$ BEGIN
  ALTER TABLE "media" ADD CONSTRAINT "media_has_content_check" CHECK ("data" IS NOT NULL OR "storage_key" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cover_url" text;
