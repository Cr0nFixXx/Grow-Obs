-- Hand-reviewed (B-61): Community-Moderation – Feed je Community, Ausblenden, Sperren, Meldungen.
ALTER TABLE "posts" ADD COLUMN "community_id" uuid;
ALTER TABLE "posts" ADD COLUMN "hidden_at" timestamp with time zone;
ALTER TABLE "posts" ADD COLUMN "hidden_by" uuid;
ALTER TABLE "item_comments" ADD COLUMN "hidden_at" timestamp with time zone;
ALTER TABLE "item_comments" ADD COLUMN "hidden_by" uuid;
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "posts" ADD CONSTRAINT "posts_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
-- Globaler Feed = community_id IS NULL; Community-Feed über (community_id, created_at).
CREATE INDEX "posts_community_created_idx" ON "posts" USING btree ("community_id","created_at");

CREATE TABLE "community_bans" (
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "community_bans_uq" ON "community_bans" USING btree ("community_id","user_id");

CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_kind_chk" CHECK ("kind" IN ('post', 'comment')),
	CONSTRAINT "reports_reason_chk" CHECK ("reason" IN ('spam', 'harassment', 'illegal', 'offtopic', 'other')),
	CONSTRAINT "reports_status_chk" CHECK ("status" IN ('open', 'hidden', 'dismissed'))
);
ALTER TABLE "reports" ADD CONSTRAINT "reports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
-- Eine Meldung je Person und Inhalt.
CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree ("reporter_id","kind","target_id");
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("community_id","status","created_at");
