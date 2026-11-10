-- B-105: Indoor/Outdoor je Grow (freiwillig, NULL = keine Angabe). Genetik, Lichttyp und Samentyp liegen je Sorte in `strain_list` (jsonb), dafür ist keine Migration nötig.
-- Handgeschrieben, additiv und idempotent (läuft bei SKIP_MIGRATIONS=true vorab von Hand).
ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "site" text;
