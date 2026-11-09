-- B-94: Chat-Antworten mit Zitat. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
-- Verweis auf die zitierte Nachricht; wird sie endgültig entfernt (Konto gelöscht), bleibt die Antwort ohne Zitat stehen.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to" uuid REFERENCES "messages"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "messages_reply_to_idx" ON "messages" USING btree ("reply_to") WHERE "reply_to" IS NOT NULL;
