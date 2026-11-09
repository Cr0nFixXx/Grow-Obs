import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { growLogs, grows, notifications, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { daysSince, isoWeekKey, reportBody, runWeeklyReports } from "../../apps/api/src/lib/weekly-report.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const SECRET = "cron-secret-long-enough-1234";

function call(path: string, { method = "GET", cookie, data, headers = {} }: { method?: string; cookie?: string; data?: unknown; headers?: Record<string, string> } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(email: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({ email, name: "Wochen Tester", handle: `w_${email.split("@")[0]}`, passwordHash: await hashPassword(PASSWORD), ...extra }).returning({ id: users.id });
  return row!.id;
}
async function loginCookie(email: string) {
  const res = await call("/auth/login", { method: "POST", data: { email, password: PASSWORD } });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return raw.split(";")[0]!;
}

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

describe("Wochenreport – Hilfsfunktionen", () => {
  it("ISO-Woche in Berlin: Jahreswechsel und Sonntagabend", () => {
    expect(isoWeekKey(new Date("2026-10-22T10:00:00Z"))).toBe("2026-W43");
    expect(isoWeekKey(new Date("2026-10-25T16:00:00Z"))).toBe("2026-W43"); // Sonntag 18:00 Berlin
    expect(isoWeekKey(new Date("2026-10-25T23:30:00Z"))).toBe("2026-W44"); // schon Montag 00:30 Berlin
    expect(isoWeekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });
  it("Tage seit Start und Text", () => {
    expect(daysSince("2026-10-01", new Date("2026-10-22T10:00:00Z"))).toBe(21);
    expect(daysSince("2026-12-01", new Date("2026-10-22T10:00:00Z"))).toBe(0);
    const text = reportBody(Array.from({ length: 6 }, (_, i) => ({ name: `G${i}`, day: 3, totalDays: 84, phase: "Keimung", entries: i === 1 ? 1 : 0 })));
    expect(text).toContain("G1: Tag 3 von 84, Keimung, 1 Eintrag in 7 Tagen");
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toMatch(/… und 2 weitere$/);
  });
});

describe("Wochenreport – Einstellung", () => {
  it("ist standardmäßig aus und lässt sich per PATCH /auth/me ein- und ausschalten", async () => {
    await makeUser("opt@example.test");
    const cookie = await loginCookie("opt@example.test");
    expect(((await (await call("/auth/me", { cookie })).json()) as { weeklyReport: boolean }).weeklyReport).toBe(false);
    const on = await call("/auth/me", { method: "PATCH", cookie, data: { weeklyReport: true } });
    expect(((await on.json()) as { weeklyReport: boolean }).weeklyReport).toBe(true);
    expect(((await (await call("/auth/me", { cookie })).json()) as { weeklyReport: boolean }).weeklyReport).toBe(true);
    const bad = await call("/auth/me", { method: "PATCH", cookie, data: { weeklyReport: "ja" } });
    expect(bad.status).toBe(400);
  });
});

describe("Wochenreport – Versand", () => {
  it("sendet nur an Opt-in-Konten mit Grow, einmal je Woche", async () => {
    const withGrow = await makeUser("a@example.test", { weeklyReport: true });
    const noGrow = await makeUser("b@example.test", { weeklyReport: true });
    const off = await makeUser("c@example.test", { weeklyReport: false });
    const [grow] = await db.insert(grows).values({ userId: withGrow, name: "Zelt 1", startDate: "2026-10-01", totalDays: 84, phase: "Vegetativ" }).returning({ id: grows.id });
    await db.insert(grows).values({ userId: off, name: "Aus", startDate: "2026-10-01" });
    // Gezählt wird nach Eintragsdatum: 25.10. und 19.10. liegen in den 7 Tagen (19.–25.10.), 18.10. und ein heute nachgetragener Alt-Eintrag nicht.
    await db.insert(growLogs).values([
      { growId: grow!.id, title: "Gegossen", loggedOn: "2026-10-25" }, { growId: grow!.id, title: "Foto", loggedOn: "2026-10-19" },
      { growId: grow!.id, title: "Zu alt", loggedOn: "2026-10-18" }, { growId: grow!.id, title: "Nachgetragen", loggedOn: "2026-09-01" },
    ]);
    const now = new Date("2026-10-25T16:00:00Z");

    const first = await runWeeklyReports(now);
    expect(first).toEqual({ week: "2026-W43", candidates: 2, sent: 1 });
    const rows = await db.select().from(notifications).where(eq(notifications.userId, withGrow));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Dein Wochenreport");
    expect(rows[0]!.body).toBe("Zelt 1: Tag 24 von 84, Vegetativ, 2 Einträge in 7 Tagen");
    expect(await db.select().from(notifications).where(eq(notifications.userId, noGrow))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.userId, off))).toHaveLength(0);

    const again = await runWeeklyReports(now);
    expect(again).toMatchObject({ candidates: 0, sent: 0 });
    expect(await db.select().from(notifications).where(eq(notifications.userId, withGrow))).toHaveLength(1);

    const nextWeek = await runWeeklyReports(new Date("2026-11-01T16:00:00Z"));
    expect(nextWeek).toMatchObject({ week: "2026-W44", sent: 1 });
  });
});

describe("GET /cron/weekly-report", () => {
  it("ist ohne CRON_SECRET nicht vorhanden", async () => {
    expect((await call("/cron/weekly-report")).status).toBe(404);
  });
  it("verlangt das Geheimnis als Bearer-Token", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await call("/cron/weekly-report")).status).toBe(401);
    expect((await call("/cron/weekly-report", { headers: { Authorization: "Bearer falsch" } })).status).toBe(401);
    const ok = await call("/cron/weekly-report", { headers: { Authorization: `Bearer ${SECRET}` } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ candidates: 0, sent: 0 });
  });
});
