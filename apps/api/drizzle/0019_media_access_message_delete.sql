-- B-82: Medien nur mit Login; Chat-Anhänge nur für Mitglieder der Unterhaltung; Nachrichten löschen.
-- Handgeschrieben und idempotent, damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
-- Bestand: bereits gesendete Chat-Bilder und -Dateien der jeweiligen Unterhaltung zuordnen.
UPDATE "media" m SET "conversation_id" = r."conversation_id"
FROM (
  SELECT "conversation_id", substring("image_url" from '^/media/([0-9a-f-]{36})$')::uuid AS media_id
  FROM "messages" WHERE "image_url" ~ '^/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT msg."conversation_id", substring(a->>'path' from '^/media/([0-9a-f-]{36})$')::uuid
  FROM "messages" msg, jsonb_array_elements(msg."attachments") a
  WHERE a->>'path' ~ '^/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
) r
WHERE m."id" = r.media_id AND m."conversation_id" IS NULL;
