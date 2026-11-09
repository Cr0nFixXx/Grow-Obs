-- B-89: Moderations-Runde. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
-- Konto sperren (Betreiber): Login aus, Grund wird dem Mitglied beim Anmelden gezeigt.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
-- Forum global ausblenden (wie Beiträge/Kommentare der Communities seit 0012).
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "hidden_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "hidden_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
-- Meldungen auch ohne Community (globaler Feed, Forum): community_id darf leer sein, kind kennt thread/forum_comment.
ALTER TABLE "reports" ALTER COLUMN "community_id" DROP NOT NULL;
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_kind_chk";
ALTER TABLE "reports" ADD CONSTRAINT "reports_kind_chk" CHECK ("kind" IN ('post', 'comment', 'thread', 'forum_comment'));
CREATE INDEX IF NOT EXISTS "reports_global_queue_idx" ON "reports" USING btree ("status","created_at") WHERE "community_id" IS NULL;
-- Protokoll der Moderationsaktionen. Namen werden mitgeschrieben (Konten können später gelöscht werden), daher keine Fremdschlüssel.
CREATE TABLE IF NOT EXISTS "moderation_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "actor_name" text NOT NULL,
  "action" text NOT NULL,
  "target_user_id" uuid,
  "target_name" text,
  "target_kind" text,
  "target_id" uuid,
  "reason" text,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "moderation_log_created_idx" ON "moderation_log" USING btree ("created_at" DESC);
ALTER TABLE "moderation_log" ENABLE ROW LEVEL SECURITY;
