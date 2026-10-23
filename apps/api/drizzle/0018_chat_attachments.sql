-- B-81: Chat-Anhänge (mehrere Bilder und Dateien je Nachricht).
-- Handgeschrieben und idempotent (IF NOT EXISTS), damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
