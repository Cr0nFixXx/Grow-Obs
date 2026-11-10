-- B-104: pH/EC je einzelner Pflanze einer Sorte. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand).
-- `plant` = 0: Wert gilt für die ganze Sorte (bisheriges Verhalten); 1..n: einzelne Pflanze der Sorte.
ALTER TABLE "grow_strain_env" ADD COLUMN IF NOT EXISTS "plant" smallint NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "grow_strain_env_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "grow_strain_env_plant_uq" ON "grow_strain_env" ("grow_id", "strain_id", "plant", "logged_on");
