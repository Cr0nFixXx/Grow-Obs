-- B-86: Grows Runde 3 – Zielbereiche für pH und EC je Grow (NULL = kein Zielbereich).
-- Handgeschrieben und idempotent, damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "ph_min" double precision DEFAULT 5.8;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "ph_max" double precision DEFAULT 6.5;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "ec_min" double precision DEFAULT 1;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "ec_max" double precision DEFAULT 2;
