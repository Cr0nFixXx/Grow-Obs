import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { growLogs, growPhotos, grows, media, notifications, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { todayIso } from "../../apps/api/src/lib/grow-state.ts";
import { runWeeklyReports } from "../../apps/api/src/lib/weekly-report.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);

async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await app.request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${key}@example.org`, password: PASSWORD }) });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const call = (who: Who | null, path: string, method = "GET", body?: unknown) =>
  app.request(path, { method, headers: { ...(who ? { Cookie: who.cookie } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
interface GrowDto { id: string; name: string; strain: string; day: number; progress: number; phase: string; status: string; condition: string; archived: boolean; endedOn: string | null; startDate: string; totalDays: number; expectedYield: string; harvest: { wetG: number | null; dryG: number | null; note: string } | null; phases: { label: string; done: boolean; active: boolean; startedOn: string | null }[]; cover: string; gallery: string[] }
const create = async (who: Who, body: Record<string, unknown> = {}) => {
  const res = await call(who, "/grows", "POST", { name: "Haze Run", strain: "Eigene Kreuzung", breeder: "Ich", medium: "Erde", ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as GrowDto;
};
const daysAgo = (n: number) => { const d = new Date(`${todayIso()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Grows: Anlegen und Berechnung (B-84)", () => {
  it("Tag, Fortschritt und Phase kommen aus dem Startdatum; freier Sortenname bleibt erhalten", async () => {
    const anna = await makeUser("anna");
    const fresh = await create(anna);
    expect(fresh).toMatchObject({ day: 0, progress: 0, phase: "Keimung", status: "active", condition: "gesund", archived: false, strain: "Eigene Kreuzung" });
    expect(fresh.phases.map((p) => p.label)).toEqual(["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"]);
    expect(fresh.phases[0]).toMatchObject({ active: true, startedOn: todayIso() });
    const old = await create(anna, { name: "Alt", startDate: daysAgo(42), totalDays: 84 });
    expect(old).toMatchObject({ day: 42, progress: 50 });
    expect((await call(anna, "/grows", "POST", { name: "Zukunft", startDate: "2999-01-01" })).status).toBe(400);
    expect((await call(anna, "/grows", "POST", { name: "Falsch", phase: "Ernte" })).status).toBe(400); // strict
    expect((await call(null, "/grows", "POST", { name: "x" })).status).toBe(401);
  });
});

describe("Grows: Bearbeiten, Phase, Zustand (B-84)", () => {
  it("bearbeitet Felder; ungültige Werte werden abgelehnt; fremde Grows sind 404", async () => {
    const [anna, bob] = [await makeUser("anna"), await makeUser("bob")];
    const g = await create(anna);
    const res = await call(anna, `/grows/${g.id}`, "PATCH", { name: "Neuer Name", strain: "Northern Haze", type: "Sativa", totalDays: 100, expectedYield: "150 g", condition: "beobachten", startDate: daysAgo(10) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Neuer Name", strain: "Northern Haze", totalDays: 100, expectedYield: "150 g", condition: "beobachten", day: 10, progress: 10 });
    for (const bad of [{ name: "" }, { totalDays: 5 }, { totalDays: 1000 }, { startDate: "2999-01-01" }, { startDate: "kein Datum" }, { condition: "tot" }, { health: 50 }, { status: "harvested" }]) {
      expect((await call(anna, `/grows/${g.id}`, "PATCH", bad)).status).toBe(400);
    }
    expect((await call(bob, `/grows/${g.id}`, "PATCH", { name: "Klau" })).status).toBe(404);
    expect((await call(anna, `/grows/${g.id}`)).status).toBe(200);
    expect(((await (await call(anna, `/grows/${g.id}`)).json()) as GrowDto).name).toBe("Neuer Name");
  });

  it("Startdatum neu setzen verschiebt den Keimungsbeginn mit", async () => {
    const anna = await makeUser("anna");
    const g = await create(anna);
    const moved = (await (await call(anna, `/grows/${g.id}`, "PATCH", { startDate: daysAgo(7) })).json()) as GrowDto;
    expect(moved.phases[0]!.startedOn).toBe(daysAgo(7));
  });

  it("Phase wechseln: merkt das Datum, zurück ist erlaubt, Datum der ersten Umstellung bleibt; ungültig/fremd/abgeschlossen abgelehnt", async () => {
    const [anna, bob] = [await makeUser("anna"), await makeUser("bob")];
    const g = await create(anna, { startDate: daysAgo(40) });
    const veg = (await (await call(anna, `/grows/${g.id}/phase`, "POST", { phase: "Vegetativ" })).json()) as GrowDto;
    expect(veg.phase).toBe("Vegetativ");
    expect(veg.phases.map((p) => p.done)).toEqual([true, false, false, false, false]);
    expect(veg.phases[1]).toMatchObject({ active: true, startedOn: todayIso() });
    const flower = (await (await call(anna, `/grows/${g.id}/phase`, "POST", { phase: "Blüte" })).json()) as GrowDto;
    expect(flower.phases.map((p) => p.done)).toEqual([true, true, false, false, false]);
    const back = (await (await call(anna, `/grows/${g.id}/phase`, "POST", { phase: "Vegetativ" })).json()) as GrowDto;
    expect(back.phase).toBe("Vegetativ");
    expect(back.phases[2]!.startedOn).toBe(todayIso()); // Datum der Blüte bleibt erhalten
    expect((await call(anna, `/grows/${g.id}/phase`, "POST", { phase: "Ernte" })).status).toBe(400);
    expect((await call(bob, `/grows/${g.id}/phase`, "POST", { phase: "Blüte" })).status).toBe(404);
    await call(anna, `/grows/${g.id}/finish`, "POST", { outcome: "harvested" });
    expect((await call(anna, `/grows/${g.id}/phase`, "POST", { phase: "Curing" })).status).toBe(409);
  });
});

describe("Grows: Ernte, Abbruch, Wiederaufnahme (B-84)", () => {
  it("Ernte: Datum und Gewichte, Tag friert ein, 100 %, zählt im Profil als Ernte", async () => {
    const anna = await makeUser("anna");
    const g = await create(anna, { startDate: daysAgo(90), totalDays: 100 });
    const res = await call(anna, `/grows/${g.id}/finish`, "POST", { outcome: "harvested", date: daysAgo(10), wetG: 400, dryG: 95, note: "Schöne Dolden" });
    expect(res.status).toBe(200);
    const done = (await res.json()) as GrowDto;
    expect(done).toMatchObject({ status: "harvested", endedOn: daysAgo(10), day: 80, progress: 100, harvest: { wetG: 400, dryG: 95, note: "Schöne Dolden" } });
    expect(done.phases.every((p) => p.done && !p.active)).toBe(true);
    const me = (await (await call(anna, "/members/anna")).json()) as { stats?: { grows: number; harvests: number } };
    expect(me.stats).toMatchObject({ grows: 1, harvests: 1 });
    // Werte nachtragen (zweiter Aufruf aktualisiert nur das Angegebene)
    const edited = (await (await call(anna, `/grows/${g.id}/finish`, "POST", { outcome: "harvested", dryG: 90 })).json()) as GrowDto;
    expect(edited.harvest).toMatchObject({ wetG: 400, dryG: 90, note: "Schöne Dolden" });
    expect(edited.endedOn).toBe(daysAgo(10));
  });

  it("Prüfungen: Datum vor Start/Zukunft, Trocken > Nass, negative Werte, fremde Grows", async () => {
    const [anna, bob] = [await makeUser("anna"), await makeUser("bob")];
    const g = await create(anna, { startDate: daysAgo(30) });
    for (const bad of [{ outcome: "harvested", date: daysAgo(60) }, { outcome: "harvested", date: "2999-01-01" }, { outcome: "harvested", wetG: 50, dryG: 80 }, { outcome: "harvested", wetG: -1 }, { outcome: "fertig" }, {}]) {
      expect((await call(anna, `/grows/${g.id}/finish`, "POST", bad)).status).toBe(400);
    }
    expect((await call(bob, `/grows/${g.id}/finish`, "POST", { outcome: "aborted" })).status).toBe(404);
  });

  it("Abbruch zählt nicht als Ernte und verwirft Gewichte; Wiederaufnehmen macht den Grow wieder aktiv", async () => {
    const anna = await makeUser("anna");
    const g = await create(anna, { startDate: daysAgo(20) });
    const aborted = (await (await call(anna, `/grows/${g.id}/finish`, "POST", { outcome: "aborted", note: "Schimmel", wetG: 10 })).json()) as GrowDto;
    expect(aborted).toMatchObject({ status: "aborted", day: 20, harvest: { wetG: null, dryG: null, note: "Schimmel" } });
    expect(((await (await call(anna, "/members/anna")).json()) as { stats?: { harvests: number } }).stats?.harvests).toBe(0);
    const again = (await (await call(anna, `/grows/${g.id}/reopen`, "POST")).json()) as GrowDto;
    expect(again).toMatchObject({ status: "active", endedOn: null, harvest: null });
    expect(again.phases.some((p) => p.active)).toBe(true);
  });
});

describe("Grows: Archiv und Löschen (B-84)", () => {
  it("Archivieren/Zurückholen ist idempotent und bleibt auf den Besitzer beschränkt", async () => {
    const [anna, bob] = [await makeUser("anna"), await makeUser("bob")];
    const g = await create(anna);
    expect(((await (await call(anna, `/grows/${g.id}/archive`, "POST")).json()) as GrowDto).archived).toBe(true);
    expect(((await (await call(anna, `/grows/${g.id}/archive`, "POST")).json()) as GrowDto).archived).toBe(true);
    expect(((await (await call(anna, "/grows")).json()) as GrowDto[])[0]!.archived).toBe(true);
    expect((await call(bob, `/grows/${g.id}/unarchive`, "POST")).status).toBe(404);
    expect(((await (await call(anna, `/grows/${g.id}/unarchive`, "POST")).json()) as GrowDto).archived).toBe(false);
  });

  it("Löschen entfernt Einträge, Fotos und die Bilddateien (außer bei anderweitiger Verwendung); wiederholt 204; Fremde 204 ohne Wirkung", async () => {
    const [anna, bob] = [await makeUser("anna"), await makeUser("bob")];
    const g = await create(anna);
    const upload = async () => (await (await app.request("/media", { method: "POST", headers: { Cookie: anna.cookie, "Content-Type": "image/png" }, body: PNG })).json()) as { id: string; path: string };
    const [a, b] = [await upload(), await upload()];
    await call(anna, `/grows/${g.id}/photos`, "POST", { url: a.path });
    await call(anna, `/grows/${g.id}/photos`, "POST", { url: b.path });
    await call(anna, `/grows/${g.id}/logs`, "POST", { title: "Gegossen", tag: "Gießen" });
    // b wird zusätzlich als Profilbild verwendet → darf nicht gelöscht werden
    await call(anna, "/auth/me", "PATCH", { avatar: b.path });

    expect((await call(bob, `/grows/${g.id}`, "DELETE")).status).toBe(204);
    expect(await db.query.grows.findFirst({ where: eq(grows.id, g.id) })).toBeTruthy();

    expect((await call(anna, `/grows/${g.id}`, "DELETE")).status).toBe(204);
    expect(await db.query.grows.findFirst({ where: eq(grows.id, g.id) })).toBeUndefined();
    expect(await db.select().from(growLogs).where(eq(growLogs.growId, g.id))).toHaveLength(0);
    expect(await db.select().from(growPhotos).where(eq(growPhotos.growId, g.id))).toHaveLength(0);
    expect(await db.query.media.findFirst({ where: eq(media.id, a.id) })).toBeUndefined();
    expect(await db.query.media.findFirst({ where: eq(media.id, b.id) })).toBeTruthy();
    expect((await call(anna, `/grows/${g.id}`, "DELETE")).status).toBe(204);
    expect((await call(anna, `/grows/${g.id}`)).status).toBe(404);
    expect((await call(null, `/grows/${g.id}`, "DELETE")).status).toBe(401);
  });
});

describe("Grows: Auswirkungen auf Statistik und Wochenreport (B-84)", () => {
  it("Wochenreport enthält nur aktive, nicht archivierte Grows", async () => {
    const anna = await makeUser("anna");
    await db.update(users).set({ weeklyReport: true }).where(eq(users.id, anna.id));
    const active = await create(anna, { name: "Aktiv", startDate: daysAgo(14) });
    const archived = await create(anna, { name: "Archiviert" });
    const harvested = await create(anna, { name: "Fertig" });
    await call(anna, `/grows/${archived.id}/archive`, "POST");
    await call(anna, `/grows/${harvested.id}/finish`, "POST", { outcome: "harvested" });
    await runWeeklyReports();
    const [note] = await db.select().from(notifications).where(eq(notifications.userId, anna.id));
    expect(note!.body).toContain("Aktiv: Tag 14");
    expect(note!.body).not.toContain("Archiviert");
    expect(note!.body).not.toContain("Fertig");
    expect(active.name).toBe("Aktiv");
  });

  it("Migration 0020: Bestand wird übernommen (Ernte → geerntet, Phase-Index, Sortenname, Phasendatum)", async () => {
    const anna = await makeUser("anna");
    const [strain] = await db.execute<{ id: string }>(sql`insert into strains (name, breeder_name, type) values ('Altsorte', 'X', 'Hybrid') returning id`);
    await db.execute(sql`insert into grows (user_id, name, strain_id, start_date, phase, phase_index) values (${anna.id}, 'Alt-Ernte', ${strain!.id}, '2026-01-01', 'Ernte', 3), (${anna.id}, 'Alt-Blüte', null, '2026-02-01', 'Blüte', 2)`);
    const migration = await import("node:fs").then((fs) => fs.readFileSync(fileURLToPath(new URL("../../apps/api/drizzle/0020_grows_lifecycle.sql", import.meta.url)), "utf8"));
    await db.execute(sql.raw(migration.replace(/--.*$/gm, "")));
    const rows = await db.select().from(grows).where(eq(grows.userId, anna.id));
    const harvest = rows.find((r) => r.name === "Alt-Ernte")!;
    expect(harvest).toMatchObject({ status: "harvested", phase: "Curing", phaseIndex: 4, strainName: "Altsorte" });
    expect(harvest.endedOn).toBeTruthy();
    const flower = rows.find((r) => r.name === "Alt-Blüte")!;
    expect(flower).toMatchObject({ status: "active", phase: "Blüte", phaseIndex: 2 });
  });
});
