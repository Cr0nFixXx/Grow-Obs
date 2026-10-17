-- Hand-reviewed (B-55): Anmeldeprotokoll ohne IP-Adresse (Datensparsamkeit); Aufbewahrung 90 Tage per Anwendungslogik.
CREATE TABLE "login_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "event" text NOT NULL,
  "device" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "login_events_user_created_idx" ON "login_events" ("user_id", "created_at");
