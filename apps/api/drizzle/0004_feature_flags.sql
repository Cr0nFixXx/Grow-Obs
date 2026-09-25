-- Hand-reviewed: globale Feature-Flags (Server ist Quelle der Wahrheit), B-49.
CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
