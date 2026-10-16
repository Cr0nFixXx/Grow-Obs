-- Hand-reviewed (B-51): Standard-Bereiche des Forums gehören zum Schema-Betrieb, nicht zum Demo-Seed.
-- Ohne sie schlägt `POST /forum/threads` auf frischen Datenbanken mit 404 fehl. Idempotent.
INSERT INTO subs (name) VALUES
  ('r/GrowTagebuch'), ('r/LivingSoil'), ('r/Automatik'), ('r/Schädlinge'), ('r/DIY'), ('r/Erntezeit')
ON CONFLICT (name) DO NOTHING;
