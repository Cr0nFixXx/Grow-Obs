-- B-85: Grows Runde 2 – Tagebuch (Log-Einträge mit echtem Datum), Fotos mit Bildunterschrift, Messwerte je Tag (inkl. pH).
-- Handgeschrieben und idempotent, damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "leaf_offset" double precision NOT NULL DEFAULT 2;

ALTER TABLE "grow_logs" ADD COLUMN IF NOT EXISTS "logged_on" date;
UPDATE "grow_logs" SET "logged_on" = ("created_at" AT TIME ZONE 'Europe/Berlin')::date WHERE "logged_on" IS NULL;
ALTER TABLE "grow_logs" ALTER COLUMN "logged_on" SET NOT NULL;
ALTER TABLE "grow_logs" ALTER COLUMN "logged_on" SET DEFAULT CURRENT_DATE;

ALTER TABLE "grow_photos" ADD COLUMN IF NOT EXISTS "caption" text NOT NULL DEFAULT '';

ALTER TABLE "grow_env" ADD COLUMN IF NOT EXISTS "ph" double precision;
ALTER TABLE "grow_env" ADD COLUMN IF NOT EXISTS "logged_on" date;
ALTER TABLE "grow_env" ALTER COLUMN "temp" DROP NOT NULL;
ALTER TABLE "grow_env" ALTER COLUMN "temp" DROP DEFAULT;
ALTER TABLE "grow_env" ALTER COLUMN "rh" DROP NOT NULL;
ALTER TABLE "grow_env" ALTER COLUMN "rh" DROP DEFAULT;
ALTER TABLE "grow_env" ALTER COLUMN "vpd" DROP NOT NULL;
ALTER TABLE "grow_env" ALTER COLUMN "vpd" DROP DEFAULT;
ALTER TABLE "grow_env" ALTER COLUMN "ec" DROP NOT NULL;
ALTER TABLE "grow_env" ALTER COLUMN "ec" DROP DEFAULT;
UPDATE "grow_env" e SET "logged_on" = g."start_date" + e."day" FROM "grows" g WHERE e."grow_id" = g."id" AND e."logged_on" IS NULL;
-- Ein Eintrag je Grow und Tag (Altbestand mit doppeltem Tag: den zuletzt angelegten behalten).
DELETE FROM "grow_env" a USING "grow_env" b WHERE a."grow_id" = b."grow_id" AND a."logged_on" = b."logged_on" AND a."ctid" < b."ctid";
ALTER TABLE "grow_env" ALTER COLUMN "logged_on" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "grow_env_grow_day_uq" ON "grow_env" ("grow_id", "logged_on");
