-- B-100: Mehrere Sorten pro Grow. Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand; alter Code bleibt lauffähig).
-- `strain_list`: Array aus { name, breeder, plants, wetG, dryG }. `strain_name` und `breeder` bleiben als Anzeigetext erhalten (Sorten bzw. Breeder, kommagetrennt).
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "strain_list" jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Bestehende Grows: die eine Sorte wird zur ersten Sorte der Liste (nur wenn die Liste noch leer ist, daher wiederholbar).
UPDATE "grows"
SET "strain_list" = jsonb_build_array(jsonb_build_object('name', "strain_name", 'breeder', CASE WHEN "breeder" = 'Unbekannt' THEN '' ELSE "breeder" END, 'plants', NULL, 'wetG', "wet_weight_g", 'dryG', "dry_weight_g"))
WHERE "strain_list" = '[]'::jsonb AND "strain_name" <> '';
