-- B-87: E-Mail-Bestaetigung, Passwort-Reset per E-Mail-Link, E-Mail-Adresse aendern.
-- Handgeschrieben und idempotent, damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
-- Bestandskonten gelten als bestaetigt (Entscheidung B-87): der UPDATE laeuft nur im selben Schritt, in dem die Spalte neu entsteht.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
    UPDATE "users" SET "email_verified_at" = now();
  END IF;
END $$;

-- Einmal-Links: nur der SHA-256-Hash des Tokens wird gespeichert (nie das Token selbst).
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "token_hash" text NOT NULL,
  "new_email" text,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_tokens_kind_check" CHECK ("kind" IN ('verify_email','reset_password','change_email'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_kind_idx" ON "auth_tokens" USING btree ("user_id","kind");
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;
