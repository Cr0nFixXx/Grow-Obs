-- Hand-reviewed (B-59): Chat + Echtzeit (Lesepositionen, Direktnachrichten-Schlüssel, Online-Status).
-- Bestehende Mitglieder bekommen "jetzt" als Leseposition: der Verlauf vor diesem Update gilt nicht als ungelesen.
ALTER TABLE "conversation_members" ADD COLUMN "last_read_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "conversations" ADD COLUMN "created_by" uuid;
ALTER TABLE "conversations" ADD COLUMN "direct_key" text;
ALTER TABLE "users" ADD COLUMN "online_until" timestamp with time zone;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
-- Eine Direktnachricht je Personenpaar (Schlüssel = sortierte Nutzer-IDs); Gruppen und ältere Konversationen haben keinen.
CREATE UNIQUE INDEX "conversations_direct_key_uq" ON "conversations" USING btree ("direct_key") WHERE "direct_key" IS NOT NULL;
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");
