-- B-101: Tagebuch, Fotos und pH/EC je Sorte. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand).
-- Sorten bekommen stabile IDs; Einträge/Fotos bekommen eine (leere) Sortenliste, pH/EC je Sorte eine eigene Tabelle.
ALTER TABLE "grow_logs" ADD COLUMN IF NOT EXISTS "strain_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "grow_photos" ADD COLUMN IF NOT EXISTS "strain_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "grow_strain_env" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "grow_id" uuid NOT NULL REFERENCES "grows"("id"),
  "strain_id" text NOT NULL,
  "logged_on" date NOT NULL,
  "ec" double precision,
  "ph" double precision
);
CREATE UNIQUE INDEX IF NOT EXISTS "grow_strain_env_uq" ON "grow_strain_env" ("grow_id", "strain_id", "logged_on");
ALTER TABLE "grow_strain_env" ENABLE ROW LEVEL SECURITY;

-- Bestehende Sorten ohne ID erhalten eine (nur Zeilen, die noch mindestens eine Sorte ohne ID haben, daher wiederholbar).
UPDATE "grows" g
SET "strain_list" = (
  SELECT jsonb_agg(CASE WHEN t.e ? 'id' THEN t.e ELSE t.e || jsonb_build_object('id', gen_random_uuid()::text) END ORDER BY t.ord)
  FROM jsonb_array_elements(g."strain_list") WITH ORDINALITY AS t(e, ord)
)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(g."strain_list") x WHERE NOT x ? 'id');
