-- Hand-reviewed (B-63): Web-Push – Abos je Gerät (an die Sitzung gebunden) und Push-Einstellungen je Konto.
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");

CREATE TABLE "push_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"messages" boolean DEFAULT true NOT NULL,
	"community" boolean DEFAULT true NOT NULL,
	"grows" boolean DEFAULT true NOT NULL,
	"other" boolean DEFAULT true NOT NULL,
	"show_preview" boolean DEFAULT false NOT NULL,
	"quiet_enabled" boolean DEFAULT false NOT NULL,
	"quiet_start" integer DEFAULT 1320 NOT NULL,
	"quiet_end" integer DEFAULT 420 NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "push_prefs" ADD CONSTRAINT "push_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
