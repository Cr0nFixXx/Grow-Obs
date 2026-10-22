-- B-73: Profilfelder, Sichtbarkeit, Handle-Wechsel (1x je 30 Tage) und Follow-System (Anfrage mit Bestätigung bei nicht öffentlichen Profilen).
-- Handgeschrieben und idempotent (IF NOT EXISTS), damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "grow_since" smallint;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "medium" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interests" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_visibility" text DEFAULT 'all' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "handle_changed_at" timestamp with time zone;
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_profile_visibility_check" CHECK ("profile_visibility" IN ('all','followers','nobody'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "follows" (
  "follower_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "followee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'accepted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "follows_pk" PRIMARY KEY ("follower_id","followee_id"),
  CONSTRAINT "follows_no_self" CHECK ("follower_id" <> "followee_id"),
  CONSTRAINT "follows_status_check" CHECK ("status" IN ('pending','accepted'))
);
CREATE INDEX IF NOT EXISTS "follows_followee_idx" ON "follows" ("followee_id","status");
-- Neue Tabellen sind nicht automatisch durch RLS geschützt (Supabase Data API); die App verbindet sich als Eigentümer und ist davon nicht betroffen.
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;
