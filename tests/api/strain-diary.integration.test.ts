import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { growStrainEnv, grows, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { todayIso } from "../../apps/api/src/lib/grow-state.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";

async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await app.request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${key}@example.org`, password: PASSWORD }) });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const call = (who: Who | null, path: string, method = "GET", body?: unknown) =>
  app.request(path, { method, headers: { ...(who ? { Cookie: who.cookie } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

interface Strain { id: string; name: string }
interface Log { id: string; title: string; strainIds: string[] }
interface Photo { id: string; url: string; strainIds: string[] }
interface EnvDto { date: string; temp: number | null; ph: number | null; ec: number | null }
interface StrainEnv { date: string; strainId: string; ph: number | null; ec: number | null }
interface GrowDto { id: string; strains: Strain[]; logs: Log[]; photos: Photo[]; env: EnvDto[]; strainEnv: StrainEnv[] }

const create = async (who: Who, names = ["A", "B", "C"]) => {
  const res = await call(who, "/grows", "POST", { name: "Mix Run", medium: "Erde", strains: names.map((name) => ({ name })) });
  expect(res.status).toBe(201);
  return (await res.json()) as GrowDto;
};
const get = async (who: Who, id: string) => (await (await call(who, `/grows/${id}`)).json()) as GrowDto;
const addLog = async (who: Who, id: string, body: Record<string, unknown>) => {
  const res = await call(who, `/grows/${id}/logs`, "POST", { title: "Eintrag", ...body });
  return { res, json: (await res.json()) as Log & { error?: string } };
};

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

describe("Grows: Tagebuch, Fotos und pH/EC je Sorte (B-101)", () => {
  it("Sorten bekommen stabile IDs; Umbenennen behält sie, neue Sorten bekommen neue", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const ids = grow.strains.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length > 10)).toBe(true);
    const res = await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [{ id: ids[0], name: "A umbenannt" }, { id: "fremd", name: "D" }, { id: ids[2], name: "C" }] });
    const next = (await res.json()) as GrowDto;
    expect(next.strains.map((x) => x.name)).toEqual(["A umbenannt", "D", "C"]);
    expect(next.strains[0]!.id).toBe(ids[0]);
    expect(next.strains[2]!.id).toBe(ids[2]);
    expect(ids).not.toContain(next.strains[1]!.id);
  });

  it("Tagebuch: Sorten wählbar, leer = ganzer Grow, Unbekanntes und Doppelte", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const [a, b] = grow.strains.map((x) => x.id);
    expect((await addLog(anna, grow.id, {})).json.strainIds).toEqual([]);
    const two = await addLog(anna, grow.id, { strainIds: [a, b, a] });
    expect(two.res.status).toBe(201);
    expect(two.json.strainIds).toEqual([a, b]);
    expect((await addLog(anna, grow.id, { strainIds: ["gibt-es-nicht"] })).res.status).toBe(400);
    const patched = await call(anna, `/grows/${grow.id}/logs/${two.json.id}`, "PATCH", { strainIds: [b] });
    expect(((await patched.json()) as Log).strainIds).toEqual([b]);
    expect((await call(anna, `/grows/${grow.id}/logs/${two.json.id}`, "PATCH", { strainIds: ["x"] })).status).toBe(400);
    const back = await call(anna, `/grows/${grow.id}/logs/${two.json.id}`, "PATCH", { strainIds: [] });
    expect(((await back.json()) as Log).strainIds).toEqual([]);
    expect((await get(anna, grow.id)).logs.find((l) => l.id === two.json.id)!.strainIds).toEqual([]);
  });

  it("Fotos: Sorten beim Hochladen und nachträglich; fremde Sorten werden abgelehnt", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const [a, b] = grow.strains.map((x) => x.id);
    const one = (await (await call(anna, `/grows/${grow.id}/photos`, "POST", { url: "https://example.org/a.jpg", strainIds: [a] })).json()) as GrowDto;
    expect(one.photos[0]!.strainIds).toEqual([a]);
    const plain = (await (await call(anna, `/grows/${grow.id}/photos`, "POST", { url: "https://example.org/b.jpg" })).json()) as GrowDto;
    expect(plain.photos[1]!.strainIds).toEqual([]);
    expect((await call(anna, `/grows/${grow.id}/photos`, "POST", { url: "https://example.org/c.jpg", strainIds: ["x"] })).status).toBe(400);
    const patched = (await (await call(anna, `/grows/${grow.id}/photos/${plain.photos[1]!.id}`, "PATCH", { strainIds: [a, b] })).json()) as GrowDto;
    expect(patched.photos[1]!.strainIds).toEqual([a, b]);
    expect((await call(anna, `/grows/${grow.id}/photos/${plain.photos[1]!.id}`, "PATCH", { strainIds: ["x"] })).status).toBe(400);
  });

  it("Messwerte: Temp/RLF für den ganzen Grow, pH/EC je Sorte; ohne strainEnv bleiben Sortenwerte unberührt", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const [a, b] = grow.strains.map((x) => x.id);
    const date = todayIso();
    const res = await call(anna, `/grows/${grow.id}/env`, "PUT", { date, temp: 24, rh: 55, strainEnv: [{ strainId: a, ph: 6.1, ec: 1.2 }, { strainId: b, ph: 6.4, ec: null }] });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as EnvDto & { strainEnv: StrainEnv[] };
    expect(saved).toMatchObject({ date, temp: 24, ph: null });
    expect(saved.strainEnv).toHaveLength(2);
    let g = await get(anna, grow.id);
    expect(g.env).toHaveLength(1);
    expect(g.strainEnv.map((e) => [e.strainId, e.ph, e.ec]).sort()).toEqual([[a, 6.1, 1.2], [b, 6.4, null]].sort());
    // ohne strainEnv: nur die Tageswerte ersetzen
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date, temp: 22 });
    g = await get(anna, grow.id);
    expect(g.env[0]!.temp).toBe(22);
    expect(g.strainEnv).toHaveLength(2);
    // mit strainEnv: ersetzt die Sortenwerte des Tages vollständig
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date, temp: 22, strainEnv: [{ strainId: b, ph: 5.9 }] });
    g = await get(anna, grow.id);
    expect(g.strainEnv.map((e) => [e.strainId, e.ph])).toEqual([[b, 5.9]]);
    // löschen entfernt beides
    expect((await call(anna, `/grows/${grow.id}/env/${date}`, "DELETE")).status).toBe(204);
    g = await get(anna, grow.id);
    expect(g.env).toHaveLength(0);
    expect(g.strainEnv).toHaveLength(0);
  });

  it("Messwerte: nur Sortenwerte sind erlaubt (kein leerer Tageswert), leer ist 400, Doppelte/Unbekannte/Bereiche werden abgelehnt", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const [a] = grow.strains.map((x) => x.id);
    const date = todayIso();
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date, temp: 20 });
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: a, ph: 6 }] })).status).toBe(200);
    let g = await get(anna, grow.id);
    expect(g.env).toHaveLength(0); // PUT = Ersatz: ohne Tageswerte entfällt der Tageswert
    expect(g.strainEnv).toHaveLength(1);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: a, ph: null, ec: null }] })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [] })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: a, ph: 6 }, { strainId: a, ph: 7 }] })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: "x", ph: 6 }] })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: a, ph: 15 }] })).status).toBe(400);
    expect((await call(anna, `/grows/${grow.id}/env`, "PUT", { date, strainEnv: [{ strainId: a, temp: 20 }] })).status).toBe(400);
    g = await get(anna, grow.id);
    expect(g.strainEnv).toHaveLength(1);
  });

  it("Sorte entfernen: Einträge und Fotos werden „ganzer Grow“, pH/EC wandert in den Tageswert (vorhandener Wert gewinnt)", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna);
    const [a, b, c] = grow.strains.map((x) => x.id);
    const d1 = todayIso();
    const log = (await addLog(anna, grow.id, { strainIds: [a, b] })).json;
    await call(anna, `/grows/${grow.id}/photos`, "POST", { url: "https://example.org/a.jpg", strainIds: [a] });
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: d1, ph: 6.0, strainEnv: [{ strainId: a, ph: 5.5, ec: 1.5 }, { strainId: b, ph: 6.5 }, { strainId: c, ph: 6.7 }] });
    const res = await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [{ id: b, name: "B" }, { id: c, name: "C" }] });
    expect(res.status).toBe(200);
    const g = (await res.json()) as GrowDto;
    expect(g.logs.find((l) => l.id === log.id)!.strainIds).toEqual([b]);
    expect(g.photos[0]!.strainIds).toEqual([]);
    expect(g.env[0]).toMatchObject({ ph: 6.0, ec: 1.5 }); // pH vorhanden → bleibt, EC war leer → übernommen
    expect(g.strainEnv.map((e) => e.strainId).sort()).toEqual([b, c].sort());
  });

  it("Sorte entfernen ohne vorhandenen Tageswert: pH/EC wird zum Tageswert des Grows", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, ["A", "B"]);
    const [a, b] = grow.strains.map((x) => x.id);
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: todayIso(), strainEnv: [{ strainId: a, ph: 6.2, ec: 1.1 }] });
    const g = (await (await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [{ id: b, name: "B" }] })).json()) as GrowDto;
    expect(g.env).toHaveLength(1);
    expect(g.env[0]).toMatchObject({ ph: 6.2, ec: 1.1, temp: null });
    expect(g.strainEnv).toHaveLength(0);
  });

  it("alter Weg `strain` auf einer Ein-Sorten-Grow behält die ID (Umbenennen); bei mehreren Sorten entfallen die Zuordnungen", async () => {
    const anna = await makeUser("anna");
    const one = await create(anna, ["Alt"]);
    const id = one.strains[0]!.id;
    const log = (await addLog(anna, one.id, { strainIds: [id] })).json;
    const renamed = (await (await call(anna, `/grows/${one.id}`, "PATCH", { strain: "Neu" })).json()) as GrowDto;
    expect(renamed.strains[0]).toMatchObject({ id, name: "Neu" });
    expect(renamed.logs.find((l) => l.id === log.id)!.strainIds).toEqual([id]);
    const many = await create(anna);
    const manyLog = (await addLog(anna, many.id, { strainIds: [many.strains[0]!.id] })).json;
    const merged = (await (await call(anna, `/grows/${many.id}`, "PATCH", { strain: "Eine" })).json()) as GrowDto;
    expect(merged.strains).toHaveLength(1);
    expect(merged.logs.find((l) => l.id === manyLog.id)!.strainIds).toEqual([]);
  });

  it("Grow löschen entfernt auch die Sortenwerte; fremde Grows sind tabu", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna);
    const a = grow.strains[0]!.id;
    await call(anna, `/grows/${grow.id}/env`, "PUT", { date: todayIso(), strainEnv: [{ strainId: a, ph: 6 }] });
    expect((await call(bob, `/grows/${grow.id}/env`, "PUT", { date: todayIso(), strainEnv: [{ strainId: a, ph: 6 }] })).status).toBe(404);
    expect((await call(anna, `/grows/${grow.id}`, "DELETE")).status).toBe(204);
    expect(await db.select().from(growStrainEnv)).toHaveLength(0);
  });

  it("Migration 0031: Sorten ohne ID erhalten eine, wiederholbar und ohne vorhandene IDs zu ändern", async () => {
    const anna = await makeUser("anna");
    const [row] = await db.insert(grows).values({ userId: anna.id, name: "Alt", strainName: "A, B", startDate: todayIso() }).returning();
    await db.execute(sql`UPDATE grows SET strain_list = '[{"name":"A","breeder":"","plants":null,"wetG":null,"dryG":null},{"id":"fest","name":"B","breeder":"","plants":2,"wetG":null,"dryG":null}]'::jsonb WHERE id = ${row!.id}`);
    const migration = readFileSync(fileURLToPath(new URL("../../apps/api/drizzle/0031_strain_diary.sql", import.meta.url)), "utf8");
    const update = migration.slice(migration.indexOf("UPDATE"));
    await db.execute(sql.raw(update));
    const first = (await db.select().from(grows).where(eq(grows.id, row!.id)))[0]!.strainList;
    await db.execute(sql.raw(update));
    const second = (await db.select().from(grows).where(eq(grows.id, row!.id)))[0]!.strainList;
    expect(first[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first[1]).toMatchObject({ id: "fest", name: "B", plants: 2 });
    expect(second).toEqual(first);
  });
});
