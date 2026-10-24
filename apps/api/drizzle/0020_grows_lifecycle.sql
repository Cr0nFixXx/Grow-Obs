-- B-84: Grows – Lebenszyklus (Phase manuell, Ernte/Abbruch, Archiv, Zustand statt Gesundheitsprozent, Sortenname frei).
-- Handgeschrieben und idempotent, damit sie bei SKIP_MIGRATIONS=true vorab von Hand eingespielt werden kann.
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "strain_name" text NOT NULL DEFAULT '';
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "condition" text NOT NULL DEFAULT 'gesund';
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "ended_on" date;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "phase_dates" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "wet_weight_g" integer;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "dry_weight_g" integer;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "harvest_note" text NOT NULL DEFAULT '';
-- Bestand: Sortenname übernehmen; bisherige Phase „Ernte“ bedeutet jetzt „geerntet“; Phase-Index auf die neue Liste (Keimung, Vegetativ, Blüte, Trocknen, Curing).
UPDATE "grows" g SET "strain_name" = s."name" FROM "strains" s WHERE g."strain_id" = s."id" AND g."strain_name" = '';
UPDATE "grows" SET "status" = 'harvested', "ended_on" = COALESCE("ended_on", "updated_at"::date), "phase" = 'Curing' WHERE "phase" = 'Ernte' AND "status" = 'active';
UPDATE "grows" SET "phase_index" = CASE "phase" WHEN 'Keimung' THEN 0 WHEN 'Vegetativ' THEN 1 WHEN 'Blüte' THEN 2 WHEN 'Trocknen' THEN 3 WHEN 'Curing' THEN 4 ELSE 0 END;
UPDATE "grows" SET "phase_dates" = jsonb_build_object('Keimung', "start_date"::text) WHERE "phase_dates" = '{}'::jsonb;
