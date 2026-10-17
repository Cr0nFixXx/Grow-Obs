-- Hand-reviewed (B-58): Erzwungener Passwortwechsel nach Einmalpasswort (Betreiber-CLI).
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
