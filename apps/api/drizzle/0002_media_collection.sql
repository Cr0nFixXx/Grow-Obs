-- Hand-reviewed: Bilder in PostgreSQL, Chat-Anhänge, persönliche Sortensammlung (B-47).
CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX media_owner_idx ON media (owner_id);
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN image_url text;
--> statement-breakpoint
CREATE TABLE strain_collection (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strain_id uuid NOT NULL REFERENCES strains(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX strain_collection_user_strain ON strain_collection (user_id, strain_id);
