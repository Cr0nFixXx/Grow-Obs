-- B-97: Livestatus. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
-- Textstatus (dauerhaft): eine Zeile mit Emoji. 24h-Status: Text, optional ein Foto, läuft nach 24 h ab (live_expires_at).
-- Sichtbarkeit je Status: all (jeder, der das Profil sehen darf), followers (nur akzeptierte Follower), nobody (nur ich).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_emoji" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_text" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_visibility" text NOT NULL DEFAULT 'all';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "live_text" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "live_image_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "live_visibility" text NOT NULL DEFAULT 'all';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "live_expires_at" timestamp with time zone;
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_status_visibility_chk";
ALTER TABLE "users" ADD CONSTRAINT "users_status_visibility_chk" CHECK ("status_visibility" IN ('all', 'followers', 'nobody'));
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_live_visibility_chk";
ALTER TABLE "users" ADD CONSTRAINT "users_live_visibility_chk" CHECK ("live_visibility" IN ('all', 'followers', 'nobody'));
CREATE INDEX IF NOT EXISTS "users_live_expires_idx" ON "users" USING btree ("live_expires_at") WHERE "live_expires_at" IS NOT NULL;
-- Antwort auf einen 24h-Status im Direktchat: Schnappschuss des Statustexts (der Server setzt ihn, nie der Client).
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "status_quote" text;
