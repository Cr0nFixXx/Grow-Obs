-- Hand-reviewed (B-65): Gruppenchats – Rollen, Beitrittszeitpunkt, Themen, Einladungen, Nachrichtenart.
ALTER TABLE "conversations" ADD COLUMN "history_visible" boolean DEFAULT false NOT NULL;
ALTER TABLE "conversation_members" ADD COLUMN "role" "member_role" DEFAULT 'member' NOT NULL;
ALTER TABLE "conversation_members" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "messages" ADD COLUMN "topic_id" uuid;
ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;

CREATE TABLE "conversation_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"admins_only" boolean DEFAULT false NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "conversation_topics" ADD CONSTRAINT "conversation_topics_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_topics" ADD CONSTRAINT "conversation_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "conversation_topics_conversation_idx" ON "conversation_topics" USING btree ("conversation_id","position");
CREATE INDEX "messages_topic_created_idx" ON "messages" USING btree ("topic_id","created_at");

CREATE TABLE "topic_members" (
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
ALTER TABLE "topic_members" ADD CONSTRAINT "topic_members_topic_id_conversation_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."conversation_topics"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "topic_members" ADD CONSTRAINT "topic_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "topic_members_uq" ON "topic_members" USING btree ("topic_id","user_id");

CREATE TABLE "topic_user_state" (
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"muted" boolean DEFAULT false NOT NULL
);
ALTER TABLE "topic_user_state" ADD CONSTRAINT "topic_user_state_topic_id_conversation_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."conversation_topics"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "topic_user_state" ADD CONSTRAINT "topic_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "topic_user_state_uq" ON "topic_user_state" USING btree ("topic_id","user_id");

CREATE TABLE "conversation_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inviter_id" uuid,
	"invitee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone
);
ALTER TABLE "conversation_invites" ADD CONSTRAINT "conversation_invites_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_invites" ADD CONSTRAINT "conversation_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversation_invites" ADD CONSTRAINT "conversation_invites_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "conversation_invites_pending_uq" ON "conversation_invites" USING btree ("conversation_id","invitee_id") WHERE "status" = 'pending';
CREATE INDEX "conversation_invites_invitee_idx" ON "conversation_invites" USING btree ("invitee_id","status");
