import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { growEnv, growLogs, growPhotos, grows, media, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { todayIso, vpdKpa } from "../../apps/api/src/lib/grow-state.ts";
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

interface Log { id: string; day: number; date: string; title: string; text: string; tag: string }
interface Env { day: number; date: string; temp: number | null; rh: number | null; vpd: number | null; ec: number | null; ph: number | null }
interface Photo { id: string; url: string; caption: string; cover: boolean }
interface GrowDto { id: string; cover: string; leafOffset: number; logs: Log[]; env: Env[]; photos: Photo[]; gallery: string[] }
const daysAgo = (n: number) => { const d = new Date(`${todayIso()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const create = async (who: Who, body: Record<string, unknown> = {}) => {
  const res = await call(who, "/grows", "POST", { name: "Haze Run", strain: "Eigene Kreuzung", medium: "Erde", startDate: daysAgo(20), ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as GrowDto;
};
const get = async (who: Who, id: string) => (await (await call(who, `/grows/${id}`)).json()) as GrowDto;
const upload = async (who: Who) => (await (await app.request("/media", { method: "POST", headers: { Cookie: who.cookie, "Content-Type": "image/png" }, body: PNG })).json()) as { id: string; path: string };

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

describe("Grows: Log-Einträge bearbeiten und löschen (B-85)", () => {
  it("neuer Eintrag mit echtem Datum: Tag wird aus Datum und Start berechnet, Standard heute, neueste zuerst", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const today = await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "Heute", tag: "Gießen" });
    expect(today.status).toBe(201);
    expect(await today.json()).toMatchObject({ title: "Heute", date: todayIso(), day: 20, tag: "Gießen", text: "" });
    const old = await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "Früher", text: "pH 6,3", date: daysAgo(15), day: 999 }); // altes `day` wird ignoriert
    expect(await old.json()).toMatchObject({ date: daysAgo(15), day: 5, tag: "Beobachtung" });
    expect((await get(anna, grow.id)).logs.map((l) => l.title)).toEqual(["Heute", "Früher"]);
  });

  it("Datum: nicht vor dem Start, nicht in der Zukunft, gültiger Kalendertag; strikte Felder", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    for (const date of [daysAgo(21), "2999-01-01", "2026-02-30", "gestern"]) {
      expect((await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "x", date })).status, date).toBe(400);
    }
    expect((await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "  " })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "x", tag: "Quatsch" })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "x", foo: 1 })).status).toBe(400);
    expect((await get(anna, grow.id)).logs).toHaveLength(0);
  });

  it("bearbeiten: Titel, Text, Kategorie, Datum (Tag folgt); leere Anfrage ändert nichts; fremde Grows/Einträge 404", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    const other = await create(anna, { name: "Zweiter" });
    const log = (await (await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "Alt", text: "a" })).json()) as Log;
    const res = await call(anna, `/grows/${grow.id}/logs/${log.id}`, "PATCH", { title: " Neu ", text: "b", tag: "Dünger", date: daysAgo(10) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: log.id, title: "Neu", text: "b", tag: "Dünger", date: daysAgo(10), day: 10 });
    expect(await (await call(anna, `/grows/${grow.id}/logs/${log.id}`, "PATCH", {})).json()).toMatchObject({ title: "Neu", day: 10 });
    expect((await call(anna, `/grows/${grow.id}/logs/${log.id}`, "PATCH", { date: daysAgo(40) })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/logs/${log.id}`, "PATCH", { title: "" })).status).toBe(400);
    expect((await call(bob, `/grows/${grow.id}/logs/${log.id}`, "PATCH", { title: "Hack" })).status).toBe(404);
    expect((await call(anna, `/grows/${other.id}/logs/${log.id}`, "PATCH", { title: "Falscher Grow" })).status).toBe(404);
    expect((await call(anna, `/grows/${grow.id}/logs/00000000-0000-4000-8000-000000000000`, "PATCH", { title: "x" })).status).toBe(404);
    expect((await get(anna, grow.id)).logs[0]).toMatchObject({ title: "Neu" });
  });

  it("löschen: wirkt nur im eigenen Grow, wiederholt 204, fremder Grow 404", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    const log = (await (await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "Weg damit" })).json()) as Log;
    expect((await call(bob, `/grows/${grow.id}/logs/${log.id}`, "DELETE")).status).toBe(404);
    expect(await db.query.growLogs.findFirst({ where: eq(growLogs.id, log.id) })).toBeTruthy();
    expect((await call(anna, `/grows/${grow.id}/logs/${log.id}`, "DELETE")).status).toBe(204);
    expect((await call(anna, `/grows/${grow.id}/logs/${log.id}`, "DELETE")).status).toBe(204);
    expect((await get(anna, grow.id)).logs).toHaveLength(0);
  });
});

describe("Grows: Fotos verwalten (B-85)", () => {
  it("Titelbild wählen, Bildunterschrift setzen; erstes Foto wird Titelbild", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const a = await upload(anna);
    const b = await upload(anna);
    await call(anna, `/grows/${grow.id}/photos`, "POST", { url: a.path });
    const two = (await (await call(anna, `/grows/${grow.id}/photos`, "POST", { url: b.path })).json()) as GrowDto;
    expect(two.cover).toBe(a.path);
    expect(two.photos.map((p) => [p.url, p.cover])).toEqual([[a.path, true], [b.path, false]]);
    expect(two.gallery).toEqual([a.path, b.path]);
    const second = two.photos[1]!;
    const res = await call(anna, `/grows/${grow.id}/photos/${second.id}`, "PATCH", { cover: true, caption: "  Tag 20, Blüte  " });
    const after = (await res.json()) as GrowDto;
    expect(after.cover).toBe(b.path);
    expect(after.photos.find((p) => p.id === second.id)).toMatchObject({ caption: "Tag 20, Blüte", cover: true });
    expect((await call(anna, `/grows/${grow.id}/photos/${second.id}`, "PATCH", { caption: "x".repeat(201) })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/photos/${second.id}`, "PATCH", { cover: false })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/photos/${second.id}`, "PATCH", { url: "x" })).status).toBe(400);
  });

  it("Löschen: Datei wird mitgelöscht; das Titelbild rückt nach; das letzte Foto entfernt das Titelbild; fremde 404", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    const a = await upload(anna);
    const b = await upload(anna);
    await call(anna, `/grows/${grow.id}/photos`, "POST", { url: a.path });
    const two = (await (await call(anna, `/grows/${grow.id}/photos`, "POST", { url: b.path })).json()) as GrowDto;
    const [first, second] = two.photos as [Photo, Photo];
    expect((await call(bob, `/grows/${grow.id}/photos/${first.id}`, "DELETE")).status).toBe(404);
    expect(await db.query.growPhotos.findFirst({ where: eq(growPhotos.id, first.id) })).toBeTruthy();

    const afterFirst = (await (await call(anna, `/grows/${grow.id}/photos/${first.id}`, "DELETE")).json()) as GrowDto;
    expect(afterFirst.photos.map((p) => p.url)).toEqual([b.path]);
    expect(afterFirst.cover).toBe(b.path);
    expect(await db.query.media.findFirst({ where: eq(media.id, a.id) })).toBeUndefined();
    expect(await db.query.media.findFirst({ where: eq(media.id, b.id) })).toBeTruthy();

    const afterSecond = (await (await call(anna, `/grows/${grow.id}/photos/${second.id}`, "DELETE")).json()) as GrowDto;
    expect(afterSecond.photos).toEqual([]);
    expect(afterSecond.cover).toBe("");
    expect(await db.query.media.findFirst({ where: eq(media.id, b.id) })).toBeUndefined();
    expect((await call(anna, `/grows/${grow.id}/photos/${second.id}`, "DELETE")).status).toBe(404);
  });

  it("ein Bild, das noch anderswo verwendet wird (z. B. als Profilbild), bleibt erhalten", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const a = await upload(anna);
    await call(anna, "/auth/me", "PATCH", { avatar: a.path });
    const withPhoto = (await (await call(anna, `/grows/${grow.id}/photos`, "POST", { url: a.path })).json()) as GrowDto;
    await call(anna, `/grows/${grow.id}/photos/${withPhoto.photos[0]!.id}`, "DELETE");
    expect(await db.query.media.findFirst({ where: eq(media.id, a.id) })).toBeTruthy();
  });
});

describe("Grows: Messwerte je Tag (B-85)", () => {
  it("ein Eintrag je Tag: erneutes Speichern ersetzt; Werte optional; VPD wird berechnet, nicht gespeichert", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const first = await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(2), temp: 25, rh: 60, ec: 1.4, ph: 6.2 });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ date: daysAgo(2), day: 18, temp: 25, rh: 60, vpd: vpdKpa(25, 60, 2), ec: 1.4, ph: 6.2 });
    const onlyPh = await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(1), ph: 6.5 });
    expect(await onlyPh.json()).toMatchObject({ temp: null, rh: null, vpd: null, ec: null, ph: 6.5 });
    // gleicher Tag: vollständiger Ersatz (fehlende Werte werden leer)
    const replaced = await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(2), temp: 22.456 });
    expect(await replaced.json()).toMatchObject({ temp: 22.46, rh: null, vpd: null, ec: null, ph: null });
    const dto = await get(anna, grow.id);
    expect(dto.env.map((e) => e.date)).toEqual([daysAgo(2), daysAgo(1)]);
    expect(await db.select().from(growEnv)).toHaveLength(2);
    expect((await db.select().from(growEnv)).every((e) => e.vpd === null)).toBe(true);
    // Standarddatum = heute
    expect((await (await call(anna, `/grows/${grow.id}/env`, "PUT", { temp: 24, rh: 55 })).json()) as Env).toMatchObject({ date: todayIso(), day: 20 });
  });

  it("Prüfungen: mindestens ein Wert, Bereiche, Datum, strikte Felder, fremder Grow", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    const put = (body: unknown, who = anna) => call(who, `/grows/${grow.id}/env`, "PUT", body);
    expect((await put({})).status).toBe(400);
    expect((await put({ temp: null, ph: null })).status).toBe(400);
    expect((await put({ ph: 15 })).status).toBe(400);
    expect((await put({ ph: -1 })).status).toBe(400);
    expect((await put({ rh: 101 })).status).toBe(400);
    expect((await put({ temp: 61 })).status).toBe(400);
    expect((await put({ ec: 11 })).status).toBe(400);
    expect((await put({ ph: "sauer" })).status).toBe(400);
    expect((await put({ ph: 6, vpd: 1 })).status).toBe(400);
    expect((await put({ ph: 6, date: daysAgo(21) })).status).toBe(400);
    expect((await put({ ph: 6, date: "2999-01-01" })).status).toBe(400);
    expect((await put({ ph: 6 }, bob)).status).toBe(404);
    expect((await get(anna, grow.id)).env).toEqual([]);
  });

  it("löschen: nur der Tag, wiederholt 204, fremder Grow 404, ungültiges Datum 400", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(3), ph: 6 });
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(2), ph: 6.1 });
    expect((await call(bob, `/grows/${grow.id}/env/${daysAgo(3)}`, "DELETE")).status).toBe(404);
    expect((await call(anna, `/grows/${grow.id}/env/kaputt`, "DELETE")).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env/${daysAgo(3)}`, "DELETE")).status).toBe(204);
    expect((await call(anna, `/grows/${grow.id}/env/${daysAgo(3)}`, "DELETE")).status).toBe(204);
    expect((await get(anna, grow.id)).env.map((e) => e.date)).toEqual([daysAgo(2)]);
  });

  it("Blatt-Abzug je Grow ändert das VPD aller Einträge (0–6 °C)", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    expect(grow.leafOffset).toBe(2);
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: daysAgo(1), temp: 25, rh: 60 });
    expect((await get(anna, grow.id)).env[0]!.vpd).toBe(vpdKpa(25, 60, 2));
    const res = await call(anna, `/grows/${grow.id}`, "PATCH", { leafOffset: 0 });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as GrowDto;
    expect(dto.leafOffset).toBe(0);
    expect(dto.env[0]!.vpd).toBe(vpdKpa(25, 60, 0));
    expect((await call(anna, `/grows/${grow.id}`, "PATCH", { leafOffset: 7 })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}`, "PATCH", { leafOffset: -1 })).status).toBe(400);
  });

  it("Grow löschen entfernt Einträge, Messwerte und Fotos mit", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    await call(anna, `/grows/${grow.id}/logs`, "POST", { title: "x" });
    await call(anna, `/grows/${grow.id}/env`, "PUT", { ph: 6 });
    expect((await call(anna, `/grows/${grow.id}`, "DELETE")).status).toBe(204);
    expect(await db.select().from(growEnv)).toHaveLength(0);
    expect(await db.select().from(growLogs)).toHaveLength(0);
    expect(await db.select().from(grows)).toHaveLength(0);
  });
});

describe("Migration 0021: Bestand wird übernommen", () => {
  it("Logs bekommen ein Datum, Messwerte ein Datum aus Start + Tag (Doppelte werden zusammengeführt), Defaults bleiben", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { startDate: "2026-09-01" });
    // Zustand vor der Migration nachstellen: Spalten entfernen/leeren und die Migration erneut ausführen.
    await db.execute(sql`DROP INDEX grow_env_grow_day_uq`);
    await db.execute(sql`ALTER TABLE grow_env ALTER COLUMN logged_on DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE grow_logs ALTER COLUMN logged_on DROP NOT NULL`);
    await db.execute(sql`INSERT INTO grow_logs (grow_id, day, date, title, tag, logged_on, created_at) VALUES (${grow.id}, 3, 'heute', 'Alt', 'Gießen', NULL, '2026-09-04T23:30:00Z')`);
    await db.execute(sql`INSERT INTO grow_env (grow_id, day, temp, rh, vpd, ec, logged_on) VALUES (${grow.id}, 5, 24, 55, 1, 1.2, NULL), (${grow.id}, 5, 26, 50, 1.3, 1.5, NULL), (${grow.id}, 6, 23, 60, 0.9, 1.1, NULL)`);
    const file = await import("node:fs/promises").then((fs) => fs.readFile(fileURLToPath(new URL("../../apps/api/drizzle/0021_grows_diary.sql", import.meta.url)), "utf8"));
    await db.execute(sql.raw(file));
    const log = await db.query.growLogs.findFirst({ where: eq(growLogs.title, "Alt") });
    expect(log?.loggedOn).toBe("2026-09-05"); // Berliner Datum von 23:30 UTC
    const env = await db.select().from(growEnv).where(eq(growEnv.growId, grow.id));
    expect(env.map((e) => e.loggedOn).sort()).toEqual(["2026-09-06", "2026-09-07"]);
    expect(env.every((e) => e.ph === null)).toBe(true);
    // Migration ist wiederholbar
    await db.execute(sql.raw(file));
    expect(await db.select().from(growEnv).where(eq(growEnv.growId, grow.id))).toHaveLength(2);
  });
});
