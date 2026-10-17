-- Hand-reviewed (B-60): gemeinsamer Zähler für Rate-Limits über mehrere API-Instanzen.
-- Schlüssel = SHA-256-Hash (keine Klartext-E-Mail/IP in der Datenbank); Fensterende nach Datenbankzeit.
CREATE UNLOGGED TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
CREATE INDEX "rate_limits_reset_idx" ON "rate_limits" USING btree ("reset_at");
