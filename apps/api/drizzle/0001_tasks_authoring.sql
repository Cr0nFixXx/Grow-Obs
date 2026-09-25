-- Hand-reviewed: Tasks + Autorenschaft für Community-Sorten und Wiki-Artikel (B-45).
CREATE TYPE task_priority AS ENUM ('hoch', 'mittel', 'niedrig');
--> statement-breakpoint
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  grow text NOT NULL DEFAULT 'Allgemein',
  due_label text NOT NULL DEFAULT 'Heute',
  prio task_priority NOT NULL DEFAULT 'mittel',
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX tasks_user_created_idx ON tasks (user_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE strains ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE wiki_articles ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL;
