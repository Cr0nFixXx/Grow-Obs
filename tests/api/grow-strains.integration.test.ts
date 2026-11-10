import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { grows, users } from "../../apps/api/src/db/schema.ts";
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


interface Strain { name: string; breeder: string; plants: number | null; wetG: number | null; dryG: number | null }
interface GrowDto { id: string; strain: string; breeder: string; strains: Strain[]; harvest: { wetG: number | null; dryG: number | null; note: string } | null }
const s = (name: string, extra: Partial<Strain> = {}): Strain => ({ name, breeder: "", plants: null, wetG: null, dryG: null, ...extra });
const create = async (who: Who, body: Record<string, unknown> = {}) => {
  const res = await call(who, "/grows", "POST", { name: "Mix Run", medium: "Erde", ...body });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await res.json()) as GrowDto;
};
const get = async (who: Who, id: string) => (await (await call(who, `/grows/${id}`)).json()) as GrowDto;

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

describe("Grows: mehrere Sorten (B-100)", () => {
  it("anlegen mit Liste: Reihenfolge, Breeder und Pflanzen bleiben, Anzeigetexte sind kommagetrennt", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strains: [s("Gorilla Glue", { breeder: "Dutch Passion", plants: 2 }), s("Northern Haze", { breeder: "Dutch Passion", plants: 1 }), s("Eigene Kreuzung")] });
    expect(grow.strains.map((x) => [x.name, x.breeder, x.plants])).toEqual([["Gorilla Glue", "Dutch Passion", 2], ["Northern Haze", "Dutch Passion", 1], ["Eigene Kreuzung", "", null]]);
    expect(grow.strain).toBe("Gorilla Glue, Northern Haze, Eigene Kreuzung");
    expect(grow.breeder).toBe("Dutch Passion");
    expect((await get(anna, grow.id)).strains).toHaveLength(3);
  });

  it("alter Weg mit einer Sorte (`strain`/`breeder`) ergibt genau eine Sorte; `Unbekannt` wird zu leerem Breeder", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strain: "Alte Sorte", breeder: "Unbekannt" });
    expect(grow.strains).toEqual([expect.objectContaining(s("Alte Sorte"))]);
    expect(grow.strain).toBe("Alte Sorte");
    const other = await create(anna, { strain: "Mit Breeder", breeder: "Barney's" });
    expect(other.strains).toEqual([expect.objectContaining(s("Mit Breeder", { breeder: "Barney's" }))]);
  });

  it("Grenzen: leere Liste, leerer Name, doppelt, mehr als 20, Pflanzen 0 oder 1000, unbekannte Felder", async () => {
    const anna = await makeUser("anna");
    const bad = async (strains: unknown) => (await call(anna, "/grows", "POST", { name: "x", strains })).status;
    expect(await bad([])).toBe(400);
    expect(await bad([s("  ")])).toBe(400);
    expect(await bad([s("A"), s("a")])).toBe(400); // gleicher Name und Breeder, Schreibweise egal
    expect(await bad(Array.from({ length: 21 }, (_, i) => s(`Sorte ${i}`)))).toBe(400);
    expect(await bad([s("A", { plants: 0 })])).toBe(400);
    expect(await bad([s("A", { plants: 1000 })])).toBe(400);
    expect(await bad([{ ...s("A"), extra: 1 }])).toBe(400);
    // gleicher Name bei anderem Breeder ist erlaubt; genau 20 gehen
    expect(await bad([s("A", { breeder: "X" }), s("A", { breeder: "Y" })])).toBe(201);
    expect(await bad(Array.from({ length: 20 }, (_, i) => s(`Sorte ${i}`)))).toBe(201);
  });

  it("bearbeiten: Liste ersetzen, Reihenfolge ändern, alte `strain`-Eingabe setzt genau eine Sorte", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strains: [s("A", { plants: 3 }), s("B")] });
    const patched = await (await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [s("B"), s("C", { breeder: "Z", plants: 1 }), s("A", { plants: 3 })] })).json() as GrowDto;
    expect(patched.strains.map((x) => x.name)).toEqual(["B", "C", "A"]);
    expect(patched.strain).toBe("B, C, A");
    expect(patched.breeder).toBe("Z");
    expect((await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [] })).status).toBe(400);
    const legacy = await (await call(anna, `/grows/${grow.id}`, "PATCH", { strain: "Nur eine" })).json() as GrowDto;
    expect(legacy.strains.map((x) => x.name)).toEqual(["Nur eine"]);
  });

  it("fremde Grows lassen sich nicht ändern", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna, { strains: [s("A"), s("B")] });
    expect((await call(bob, `/grows/${grow.id}`, "PATCH", { strains: [s("Hack")] })).status).toBe(404);
    expect((await get(anna, grow.id)).strains.map((x) => x.name)).toEqual(["A", "B"]);
  });

  it("Ernte mit Gewichten je Sorte: Summen werden Gesamtgewicht, Gewichte bleiben je Sorte", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strains: [s("A"), s("B"), s("C")] });
    const done = await (await call(anna, `/grows/${grow.id}/finish`, "POST", { outcome: "harvested", strainWeights: [{ wetG: 400, dryG: 100 }, { wetG: 300, dryG: null }, { wetG: null, dryG: null }] })).json() as GrowDto;
    expect(done.harvest).toMatchObject({ wetG: 700, dryG: 100 });
    expect(done.strains.map((x) => [x.wetG, x.dryG])).toEqual([[400, 100], [300, null], [null, null]]);
  });

  it("Ernte: Länge muss passen, Trocken nicht größer als Nass je Sorte, Abbruch löscht Gewichte", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strains: [s("A"), s("B")] });
    const fin = (body: unknown) => call(anna, `/grows/${grow.id}/finish`, "POST", body);
    expect((await fin({ outcome: "harvested", strainWeights: [{ wetG: 1, dryG: 1 }] })).status).toBe(400);
    expect((await fin({ outcome: "harvested", strainWeights: [{ wetG: 10, dryG: 20 }, { wetG: null, dryG: null }] })).status).toBe(400);
    expect((await fin({ outcome: "harvested", strainWeights: [{ wetG: 10, dryG: 5 }, { wetG: 20, dryG: 8 }] })).status).toBe(200);
    const aborted = await (await fin({ outcome: "aborted" })).json() as GrowDto;
    expect(aborted.harvest).toMatchObject({ wetG: null, dryG: null });
    expect(aborted.strains.every((x) => x.wetG === null && x.dryG === null)).toBe(true);
  });

  it("Ernte einer einzelnen Sorte: Gesamtgewichte gelten für sie (alter Weg)", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strain: "Solo" });
    const done = await (await call(anna, `/grows/${grow.id}/finish`, "POST", { outcome: "harvested", wetG: 250, dryG: 60 })).json() as GrowDto;
    expect(done.harvest).toMatchObject({ wetG: 250, dryG: 60 });
    expect(done.strains[0]).toMatchObject({ name: "Solo", wetG: 250, dryG: 60 });
  });

  it("Gesamtgewichte ohne Aufteilung bleiben bei mehreren Sorten erhalten; Liste bearbeiten ändert sie nicht", async () => {
    const anna = await makeUser("anna");
    const grow = await create(anna, { strains: [s("A"), s("B")] });
    await call(anna, `/grows/${grow.id}/finish`, "POST", { outcome: "harvested", wetG: 500, dryG: 120 });
    const patched = await (await call(anna, `/grows/${grow.id}`, "PATCH", { strains: [s("A"), s("B"), s("C")] })).json() as GrowDto;
    expect(patched.harvest).toMatchObject({ wetG: 500, dryG: 120 });
  });

  it("Migration: bestehender Grow ohne Liste erhält seine Sorte als erste Sorte", async () => {
    const anna = await makeUser("anna");
    const [row] = await db.insert(grows).values({ userId: anna.id, name: "Alt", strainName: "Alte Sorte", breeder: "Altbreeder", startDate: daysAgoIso(5), wetWeightG: 80, dryWeightG: 20 }).returning();
    await db.execute(sql`UPDATE grows SET strain_list = '[]'::jsonb WHERE id = ${row!.id}`);
    // Lesen ohne Liste: Rückfall auf die alte Sorte
    expect((await get(anna, row!.id)).strains).toEqual([expect.objectContaining(s("Alte Sorte", { breeder: "Altbreeder", wetG: 80, dryG: 20 }))]);
    // Die Migrations-UPDATE-Anweisung selbst (Teil von 0030) ist wiederholbar und füllt die Liste
    const migration = (await import("node:fs")).readFileSync(fileURLToPath(new URL("../../apps/api/drizzle/0030_grow_strains.sql", import.meta.url)), "utf8");
    const update = migration.slice(migration.indexOf("UPDATE"));
    await db.execute(sql.raw(update));
    await db.execute(sql.raw(update));
    const list = (await db.select().from(grows).where(eq(grows.id, row!.id)))[0]!.strainList;
    expect(list).toEqual([s("Alte Sorte", { breeder: "Altbreeder", wetG: 80, dryG: 20 })]);
  });

  it("Anlegen mit Sichtbarkeit und ohne Sorte (B-102)", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const mk = async (body: Record<string, unknown>) => call(anna, "/grows", "POST", { name: "Wizard", medium: "Hydro / DWC", type: "Sativa", ...body });
    // Standard: privat, auch ohne Sorten
    const plain = await mk({});
    expect(plain.status).toBe(201);
    expect(await plain.json()).toMatchObject({ visibility: "private", strains: [], medium: "Hydro / DWC", type: "Sativa" });
    // gewählte Sichtbarkeit wird gespeichert und wirkt sofort für andere
    for (const visibility of ["public", "community"] as const) {
      const res = await mk({ visibility, strains: [s("A")] });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ visibility });
    }
    const listed = await (await call(bob, "/members/anna/grows")).json() as { visibility?: string }[];
    expect(listed.length).toBe(1);
    // ungültige Werte werden abgelehnt
    expect((await mk({ visibility: "alle" })).status).toBe(400);
  });

  it("Mitgliedsliste nennt alle Sortennamen", async () => {
    const anna = await makeUser("anna");
    const bob = await makeUser("bob");
    const grow = await create(anna, { strains: [s("A"), s("B")] });
    await call(anna, `/grows/${grow.id}`, "PATCH", { visibility: "public" });
    const list = await (await call(bob, "/members/anna/grows")).json() as { strain: string; strains: string[] }[];
    expect(list[0]).toMatchObject({ strain: "A, B", strains: ["A", "B"] });
  });
});

describe("Grows: Genetik, Licht, Samen und Indoor/Outdoor (B-105)", () => {
  type Traits = { genetics?: string | null; light?: string | null; seed?: string | null };
  const traitsOf = (g: GrowDto) => g.strains.map((x) => { const t = x as unknown as Traits; return [t.genetics ?? null, t.light ?? null, t.seed ?? null]; });
  const typeOf = async (id: string) => (await db.select({ type: grows.type }).from(grows).where(eq(grows.id, id)))[0]!.type;

  it("anlegen: Angaben je Sorte und Ort werden gespeichert; ohne Angaben bleibt alles leer (Typ Hybrid)", async () => {
    const anna = await makeUser("anna");
    const plain = await create(anna, { strains: [s("A")] }) as GrowDto & { site: string | null; type: string };
    expect(plain.site).toBeNull();
    expect(plain.type).toBe("Hybrid");
    expect(traitsOf(plain)).toEqual([[null, null, null]]);
    const g = await create(anna, { site: "outdoor", strains: [s("A", { genetics: "Indica", light: "auto", seed: "feminized" } as Partial<Strain>), s("B")] }) as GrowDto & { site: string | null };
    expect(g.site).toBe("outdoor");
    expect(traitsOf(g)).toEqual([["Indica", "auto", "feminized"], [null, null, null]]);
    expect(((await get(anna, g.id)) as GrowDto & { site: string }).site).toBe("outdoor");
  });

  it("Typ des Grows folgt den Sorten: gleich → dieser, gemischt → Hybrid, ohne Angabe → Hybrid; ein mitgeschickter Typ gewinnt", async () => {
    const anna = await makeUser("anna");
    const one = await create(anna, { strains: [s("A", { genetics: "Sativa" } as Partial<Strain>)] });
    expect(await typeOf(one.id)).toBe("Sativa");
    const same = await create(anna, { strains: [s("A", { genetics: "Indica" } as Partial<Strain>), s("B", { genetics: "Indica" } as Partial<Strain>), s("C")] });
    expect(await typeOf(same.id)).toBe("Indica");
    const mixed = await create(anna, { strains: [s("A", { genetics: "Indica" } as Partial<Strain>), s("B", { genetics: "Sativa" } as Partial<Strain>)] });
    expect(await typeOf(mixed.id)).toBe("Hybrid");
    const explicit = await create(anna, { type: "Sativa", strains: [s("A", { genetics: "Indica" } as Partial<Strain>)] });
    expect(await typeOf(explicit.id)).toBe("Sativa");
  });

  it("bearbeiten: Genetik ändert den Typ; fehlende Angaben bleiben, null löscht; Sorten ohne Angabe lassen den Typ stehen", async () => {
    const anna = await makeUser("anna");
    const g = await create(anna, { strains: [s("A", { genetics: "Indica", light: "photo", seed: "regular" } as Partial<Strain>)] });
    const id = (g.strains[0] as unknown as { id: string }).id;
    // Angaben nicht mitgeschickt → bleiben (nur Pflanzenzahl ändert sich)
    let res = await call(anna, `/grows/${g.id}`, "PATCH", { strains: [{ id, name: "A", breeder: "", plants: 2 }] });
    expect(res.status).toBe(200);
    expect(traitsOf((await res.json()) as GrowDto)).toEqual([["Indica", "photo", "regular"]]);
    // Einzelne Angabe auf null → gelöscht, Genetik neu → Typ folgt
    res = await call(anna, `/grows/${g.id}`, "PATCH", { strains: [{ id, name: "A", breeder: "", plants: 2, genetics: "Sativa", light: null }] });
    expect(traitsOf((await res.json()) as GrowDto)).toEqual([["Sativa", null, "regular"]]);
    expect(await typeOf(g.id)).toBe("Sativa");
    // Alle Genetik-Angaben gelöscht → der bisherige Typ bleibt
    await call(anna, `/grows/${g.id}`, "PATCH", { strains: [{ id, name: "A", breeder: "", plants: 2, genetics: null }] });
    expect(await typeOf(g.id)).toBe("Sativa");
    // Ort ändern und löschen
    res = await call(anna, `/grows/${g.id}`, "PATCH", { site: "indoor" });
    expect(((await res.json()) as { site: string }).site).toBe("indoor");
    res = await call(anna, `/grows/${g.id}`, "PATCH", { site: null });
    expect(((await res.json()) as { site: string | null }).site).toBeNull();
  });

  it("ungültige Werte werden abgelehnt", async () => {
    const anna = await makeUser("anna");
    const bad = async (strains: unknown, extra: Record<string, unknown> = {}) => (await call(anna, "/grows", "POST", { name: "x", strains, ...extra })).status;
    expect(await bad([s("A", { genetics: "Ruderalis" } as Partial<Strain>)])).toBe(400);
    expect(await bad([s("A", { light: "led" } as Partial<Strain>)])).toBe(400);
    expect(await bad([s("A", { seed: "klon" } as Partial<Strain>)])).toBe(400);
    expect(await bad([s("A")], { site: "balkon" })).toBe(400);
  });
});

function daysAgoIso(n: number) { const d = new Date(`${todayIso()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
