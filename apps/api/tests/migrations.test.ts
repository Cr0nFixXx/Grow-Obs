import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../drizzle/", import.meta.url));

describe("Migrationen", () => {
  it("Journal und SQL-Dateien sind konsistent (lückenlos, aufsteigende Zeitstempel, Datei vorhanden)", () => {
    const journal = JSON.parse(readFileSync(`${dir}meta/_journal.json`, "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      if (index > 0) expect(entry.when).toBeGreaterThan(journal.entries[index - 1]!.when);
      expect(() => readFileSync(`${dir}${entry.tag}.sql`, "utf8")).not.toThrow();
    });
  });

  it("0016 ergänzt Profilfelder und Follow-System: idempotent, Sichtbarkeit/Status geprüft, kein Selbst-Folgen, RLS an", () => {
    const sql = readFileSync(`${dir}0016_profile_follow.sql`, "utf8");
    for (const column of ["bio", "location", "grow_since", "medium", "interests", "profile_visibility", "handle_changed_at"]) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    expect(sql).toContain(`CHECK ("profile_visibility" IN ('all','followers','nobody'))`);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "follows"/);
    expect(sql).toContain('PRIMARY KEY ("follower_id","followee_id")');
    expect(sql).toContain('CHECK ("follower_id" <> "followee_id")');
    expect(sql).toContain(`CHECK ("status" IN ('pending','accepted'))`);
    expect(sql).toMatch(/REFERENCES "users"\("id"\) ON DELETE CASCADE/);
    expect(sql).toContain('ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY');
  });

  it("0014 ergänzt Gruppenchats: Rollen, Beitrittszeit, Themen, Einladungen (eine offene je Person und Gruppe)", () => {
    const sql = readFileSync(`${dir}0014_chat_groups.sql`, "utf8");
    expect(sql).toContain('ALTER TABLE "conversations" ADD COLUMN "history_visible" boolean DEFAULT false NOT NULL');
    expect(sql).toContain('ALTER TABLE "conversation_members" ADD COLUMN "role" "member_role" DEFAULT \'member\' NOT NULL');
    expect(sql).toContain('ADD COLUMN "joined_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(sql).toContain('ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT \'user\' NOT NULL');
    expect(sql).toMatch(/CREATE TABLE "conversation_topics"/);
    expect(sql).toMatch(/"conversation_topics_conversation_id_conversations_id_fk" FOREIGN KEY \("conversation_id"\) REFERENCES "public"\."conversations"\("id"\) ON DELETE cascade/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "topic_members_uq"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "topic_user_state_uq"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "conversation_invites_pending_uq" ON "conversation_invites" USING btree \("conversation_id","invitee_id"\) WHERE "status" = 'pending'/);
  });

  it("0013 legt Push-Abos (je Gerät, eindeutiger Endpunkt, mit Sitzung/Konto kaskadierend) und Push-Einstellungen an", () => {
    const sql = readFileSync(`${dir}0013_web_push.sql`, "utf8");
    expect(sql).toMatch(/CREATE TABLE "push_subscriptions"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree \("endpoint"\)/);
    expect(sql).toMatch(/"push_subscriptions_session_id_sessions_id_fk" FOREIGN KEY \("session_id"\) REFERENCES "public"\."sessions"\("id"\) ON DELETE cascade/);
    expect(sql).toMatch(/"push_subscriptions_user_id_users_id_fk" FOREIGN KEY \("user_id"\) REFERENCES "public"\."users"\("id"\) ON DELETE cascade/);
    expect(sql).toMatch(/CREATE TABLE "push_prefs"/);
    expect(sql).toContain('"show_preview" boolean DEFAULT false NOT NULL');
    expect(sql).toContain('"timezone" text DEFAULT \'Europe/Berlin\' NOT NULL');
  });

  it("0012 ergänzt Community-Feed, Ausblenden, Sperrliste und Meldungen (eine Meldung je Person und Inhalt)", () => {
    const sql = readFileSync(`${dir}0012_community_moderation.sql`, "utf8");
    expect(sql).toMatch(/ALTER TABLE "posts" ADD COLUMN "community_id" uuid/);
    expect(sql).toMatch(/ALTER TABLE "posts" ADD COLUMN "hidden_at"/);
    expect(sql).toMatch(/ALTER TABLE "item_comments" ADD COLUMN "hidden_at"/);
    expect(sql).toMatch(/CREATE TABLE "community_bans"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "community_bans_uq"/);
    expect(sql).toMatch(/CREATE TABLE "reports"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree \("reporter_id","kind","target_id"\)/);
  });

  it("0011 legt die gemeinsame Rate-Limit-Tabelle an (Hash-Schlüssel, Ablaufindex, UNLOGGED)", () => {
    const sql = readFileSync(`${dir}0011_rate_limits.sql`, "utf8");
    expect(sql).toMatch(/CREATE UNLOGGED TABLE "rate_limits"/);
    expect(sql).toMatch(/"key" text PRIMARY KEY/);
    expect(sql).toMatch(/"reset_at" timestamp with time zone NOT NULL/);
    expect(sql).toMatch(/CREATE INDEX "rate_limits_reset_idx"/);
  });

  it("0010 ergänzt Leseposition, Direktnachrichten-Schlüssel (eindeutig, nur wenn gesetzt) und Online-Status", () => {
    const sql = readFileSync(`${dir}0010_chat_realtime.sql`, "utf8");
    expect(sql).toContain('"last_read_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(sql).toContain('"online_until" timestamp with time zone');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "conversations_direct_key_uq"[^;]*WHERE "direct_key" IS NOT NULL/);
    expect(sql).toContain("messages_conversation_created_idx");
  });

  it("0009 ergänzt die Pflichtwechsel-Spalte mit Standard false", () => {
    const sql = readFileSync(`${dir}0009_must_change_password.sql`, "utf8");
    expect(sql).toContain('"must_change_password" boolean DEFAULT false NOT NULL');
  });

  it("0008 legt das Anmeldeprotokoll ohne IP-Spalte an", () => {
    const sql = readFileSync(`${dir}0008_login_events.sql`, "utf8");
    expect(sql).toContain('CREATE TABLE "login_events"');
    expect(sql).toMatch(/ON DELETE cascade/);
    expect(sql.replace(/^--.*$/gm, "").toLowerCase()).not.toMatch(/\bip\b|ip_address/); // Kommentare ausgenommen
  });

  it("0007 legt die Sitzungs-Tabelle mit Kaskade und Indizes an", () => {
    const sql = readFileSync(`${dir}0007_sessions.sql`, "utf8");
    expect(sql).toContain('CREATE TABLE "sessions"');
    expect(sql).toMatch(/ON DELETE cascade/);
    expect(sql).toContain("sessions_user_idx");
    expect(sql).toContain("sessions_expires_idx");
  });

  it("0006 legt alle Standard-Forumbereiche idempotent an (Forum ist auf frischer DB ohne Seed nutzbar)", () => {
    const sql = readFileSync(`${dir}0006_default_forum_subs.sql`, "utf8");
    for (const name of ["r/GrowTagebuch", "r/LivingSoil", "r/Automatik", "r/Schädlinge", "r/DIY", "r/Erntezeit"]) expect(sql).toContain(`'${name}'`);
    expect(sql).toMatch(/ON CONFLICT \(name\) DO NOTHING/);
  });
});
