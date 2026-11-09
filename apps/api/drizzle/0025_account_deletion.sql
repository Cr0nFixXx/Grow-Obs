-- B-74: Konto löschen. Ein gelöschtes Konto bleibt (wenn Inhalte stehen bleiben) als anonyme Hülle ohne Zugang erhalten.
-- Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
