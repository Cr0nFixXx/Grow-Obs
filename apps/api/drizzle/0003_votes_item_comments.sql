-- Hand-reviewed: Kommentar-Votes im Forum, Kommentare zu Posts/Hall of Fame (B-48).
CREATE TABLE comment_votes (
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX comment_votes_uq ON comment_votes (comment_id, user_id);
--> statement-breakpoint
CREATE TABLE item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('post', 'hall')),
  item_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX item_comments_target_idx ON item_comments (kind, item_id, created_at);
