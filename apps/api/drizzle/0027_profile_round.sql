-- B-92: Profil-Runde. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
-- Sichtbarkeit je Grow: private (Standard, nur der Besitzer), public (jedes Mitglied, das das Profil sehen darf), community (nur Mitglieder einer gemeinsamen Community).
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'private';
ALTER TABLE "grows" DROP CONSTRAINT IF EXISTS "grows_visibility_chk";
ALTER TABLE "grows" ADD CONSTRAINT "grows_visibility_chk" CHECK ("visibility" IN ('private', 'public', 'community'));
CREATE INDEX IF NOT EXISTS "grows_user_visibility_idx" ON "grows" USING btree ("user_id","visibility");
