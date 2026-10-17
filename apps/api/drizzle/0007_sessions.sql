-- Hand-reviewed (B-54): serverseitige Sitzungen für HttpOnly-Cookie-Login mit Widerruf (Logout, „Alle Geräte“, Geräteliste).
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "user_agent" text
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires_at");
