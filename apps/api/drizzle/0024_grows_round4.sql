-- B-88: Grows Runde 4 – Zielbereiche je Phase (Überschreibungen je Grow), Erinnerungen bei fehlenden Einträgen.
-- Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).

-- Zielbereiche: `targets` hält nur Überschreibungen. Schlüssel fehlt = Standard der Phase, `null` = kein Ziel, {min,max} = eigener Bereich.
-- Die alten Spalten ph_min/ph_max/ec_min/ec_max bleiben unverändert stehen (der Stand vor dem Deploy liest sie noch).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'grows' AND column_name = 'targets'
  ) THEN
    ALTER TABLE "grows" ADD COLUMN "targets" jsonb NOT NULL DEFAULT '{}'::jsonb;
    UPDATE "grows" SET "targets" =
      (CASE
        WHEN "ph_min" IS NULL OR "ph_max" IS NULL THEN jsonb_build_object('ph', NULL::jsonb)
        WHEN "ph_min" = 5.8 AND "ph_max" = 6.5 THEN '{}'::jsonb
        ELSE jsonb_build_object('ph', jsonb_build_object('min', "ph_min", 'max', "ph_max"))
      END) ||
      (CASE
        WHEN "ec_min" IS NULL OR "ec_max" IS NULL THEN jsonb_build_object('ec', NULL::jsonb)
        WHEN "ec_min" = 1 AND "ec_max" = 2 THEN '{}'::jsonb
        ELSE jsonb_build_object('ec', jsonb_build_object('min', "ec_min", 'max', "ec_max"))
      END);
  END IF;
END $$;

-- Erinnerungen (nur In-App): Opt-in je Konto (1–5 Tage ohne Eintrag), je Grow wird je Lücke einmal erinnert.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "grow_reminder_days" smallint;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "reminded_env_on" date;
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "reminded_log_on" date;
