import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { growEnv, growLogs, grows, notifications, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { reminderBody, runGrowReminders } from "../../apps/api/src/lib/grow-reminders.ts";
import { todayIso } from "../../apps/api/src/lib/grow-state.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const SECRET = "cron-secret-long-enough-1234";
const NOW = new Date("2026-10-20T14:00:00Z"); // Berlin: 20.10.2026
const day = (n: number) => { const d = new Date("2026-10-20T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

function call(path: string, { method = "GET", cookie, data, headers = {} }: { method?: string; cookie?: string; data?: unknown; headers?: Record<string, string> } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(email: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({ email, name: "Erinnerung", handle: `r_${email.split("@")[0]}`, passwordHash: await hashPassword(PASSWORD), ...extra }).returning({ id: users.id });
  return row!.id;
}
async function makeGrow(userId: string, extra: Partial<typeof grows.$inferInsert> = {}) {
  const [row] = await db.insert(grows).values({ userId, name: "Cherry Run", startDate: day(30), ...extra }).returning({ id: grows.id });
  return row!.id;
}
const notes = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
});
afterEach(() => { delete process.env.CRON_SECRET; });
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Erinnerungen – Text", () => {
  it("eine Zeile je Grow und Art, gekürzt nach fünf", () => {
    expect(reminderBody([{ name: "A", kind: "env", days: 3 }, { name: "A", kind: "log", days: 1 }])).toBe("A: seit 3 Tagen keine Messwerte\nA: seit 1 Tag kein Log-Eintrag");
    const text = reminderBody(Array.from({ length: 7 }, (_, i) => ({ name: `G${i}`, kind: "env" as const, days: 2 })));
    expect(text.split("\n")).toHaveLength(6);
    expect(text).toMatch(/… und 2 weitere$/);
  });
});

describe("runGrowReminders (B-88)", () => {
  it("meldet nur Konten mit Frist, nur laufende und nicht archivierte Grows, gebündelt in einer Meldung", async () => {
    const on = await makeUser("on@example.test", { growReminderDays: 2 });
    const off = await makeUser("off@example.test");
    for (const id of [on, off]) {
      await makeGrow(id, { name: "Läuft" });
      await makeGrow(id, { name: "Geerntet", status: "harvested", endedOn: day(5) });
      await makeGrow(id, { name: "Archiv", archivedAt: new Date() });
    }
    const result = await runGrowReminders(NOW);
    expect(result).toEqual({ candidates: 1, notified: 1, lines: 2 });
    expect(await notes(off)).toHaveLength(0);
    const [note] = await notes(on);
    expect(note!.type).toBe("grow");
    expect(note!.body).toBe("Läuft: seit 30 Tagen keine Messwerte\nLäuft: seit 30 Tagen kein Log-Eintrag");
  });

  it("Frist: erst ab N Tagen ohne Eintrag; Messwerte und Logs getrennt gezählt", async () => {
    const id = await makeUser("a@example.test", { growReminderDays: 3 });
    const grow = await makeGrow(id, { startDate: day(10) });
    await db.insert(growEnv).values({ growId: grow, day: 8, loggedOn: day(2), ph: 6 }); // 2 Tage her → noch ok
    await db.insert(growLogs).values({ growId: grow, title: "x", loggedOn: day(4) }); // 4 Tage her → fällig
    expect(await runGrowReminders(NOW)).toMatchObject({ notified: 1, lines: 1 });
    expect((await notes(id))[0]!.body).toBe("Cherry Run: seit 4 Tagen kein Log-Eintrag");
  });

  it("ohne Eintrag zählt das Startdatum; ein frisch gestarteter Grow wird noch nicht gemeldet", async () => {
    const id = await makeUser("a@example.test", { growReminderDays: 2 });
    await makeGrow(id, { startDate: day(1) });
    expect(await runGrowReminders(NOW)).toMatchObject({ notified: 0 });
    await db.update(grows).set({ startDate: day(2) });
    expect((await runGrowReminders(NOW)).lines).toBe(2);
  });

  it("je Lücke nur einmal: zweiter Lauf schweigt, nach neuem Eintrag und neuer Lücke wird wieder erinnert", async () => {
    const id = await makeUser("a@example.test", { growReminderDays: 2 });
    const grow = await makeGrow(id, { startDate: day(10) });
    await db.insert(growLogs).values({ growId: grow, title: "x", loggedOn: day(0) });
    await db.insert(growEnv).values({ growId: grow, day: 1, loggedOn: day(5), ph: 6 });
    expect(await runGrowReminders(NOW)).toMatchObject({ notified: 1, lines: 1 }); // nur Messwerte (5 Tage)
    expect(await runGrowReminders(NOW)).toMatchObject({ notified: 0, lines: 0 }); // gleiche Lücke
    expect(await runGrowReminders(new Date("2026-10-25T14:00:00Z"))).toMatchObject({ notified: 1, lines: 1 }); // Logs jetzt auch 5 Tage alt; Messwerte-Lücke bleibt still
    expect(await notes(id)).toHaveLength(2);
    // neuer Messwert beendet die Lücke; nach weiteren 2 Tagen ohne Wert gibt es wieder eine Erinnerung
    await db.insert(growEnv).values({ growId: grow, day: 6, loggedOn: day(0), ec: 1.2 });
    expect(await runGrowReminders(new Date("2026-10-21T14:00:00Z"))).toMatchObject({ lines: 0 });
    expect(await runGrowReminders(new Date("2026-10-22T14:00:00Z"))).toMatchObject({ lines: 1 });
  });

  it("parallele Läufe senden nicht doppelt", async () => {
    const id = await makeUser("a@example.test", { growReminderDays: 1 });
    const growId = await makeGrow(id);
    // Nur Messwerte fehlen (Log von heute): je Art wird atomar reserviert; fehlen beide Arten, können zwei gleichzeitige Läufe je eine Art
    // übernehmen und zwei Meldungen senden – der Cron läuft einmal täglich, daher bewusst nicht abgesichert.
    await db.insert(growLogs).values({ growId, day: 30, title: "Heute", body: "", loggedOn: day(0) });
    await Promise.all([runGrowReminders(NOW), runGrowReminders(NOW), runGrowReminders(NOW)]);
    expect((await notes(id)).length).toBe(1);
  });
});

describe("Einstellung und Cron-Route", () => {
  it("PATCH /auth/me: 1–5 Tage oder null; alles andere abgelehnt; /auth/me liefert den Wert", async () => {
    await makeUser("e@example.test");
    const res = await call("/auth/login", { method: "POST", data: { email: "e@example.test", password: PASSWORD } });
    const cookie = res.headers.getSetCookie().find((l) => l.startsWith(`${SESSION_COOKIE}=`))!.split(";")[0]!;
    const patch = (growReminderDays: unknown) => call("/auth/me", { method: "PATCH", cookie, data: { growReminderDays } });
    expect(((await (await patch(3)).json()) as { growReminderDays: number }).growReminderDays).toBe(3);
    expect(((await (await call("/auth/me", { cookie })).json()) as { growReminderDays: number }).growReminderDays).toBe(3);
    for (const bad of [0, 6, 1.5, "2"]) expect((await patch(bad)).status).toBe(400);
    expect(((await (await patch(null)).json()) as { growReminderDays: number | null }).growReminderDays).toBeNull();
  });

  it("GET /cron/grow-reminders: ohne Geheimnis 404, falsches 401, richtiges sendet", async () => {
    expect((await call("/cron/grow-reminders")).status).toBe(404);
    process.env.CRON_SECRET = SECRET;
    expect((await call("/cron/grow-reminders")).status).toBe(401);
    expect((await call("/cron/grow-reminders", { headers: { Authorization: "Bearer falsch" } })).status).toBe(401);
    const id = await makeUser("c@example.test", { growReminderDays: 1 });
    await makeGrow(id, { startDate: day(3) });
    const ok = await call("/cron/grow-reminders", { headers: { Authorization: `Bearer ${SECRET}` } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { notified: number }).notified).toBe(1);
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
