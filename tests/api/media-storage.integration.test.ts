import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Object Storage als Speicher im Arbeitsspeicher – das Verhalten des echten Buckets (Supabase S3) ist separat von Hand geprüft.
const store = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; type: string }>(), failPut: false, deleted: [] as string[] }));
vi.mock("../../apps/api/src/lib/s3.ts", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/lib/s3.ts")>()),
  mediaInStorage: () => true,
  putObject: async (key: string, bytes: Uint8Array, type: string) => {
    if (store.failPut) throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    store.objects.set(key, { bytes, type });
  },
  deleteObject: async (key: string) => { store.deleted.push(key); store.objects.delete(key); },
  signedGetUrl: async (key: string) => `https://storage.example.test/signed/${key}?X-Amz-Signature=abc`,
}));

import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { media, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);

async function makeUser(key: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD), ...extra }).returning({ id: users.id });
  const res = await app.request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${key}@example.org`, password: PASSWORD }) });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, handle: key, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const upload = (who: Who, body: Uint8Array = PNG) => app.request("/media", { method: "POST", headers: { Cookie: who.cookie, "Content-Type": "image/png" }, body });
const patch = (who: Who, data: unknown) => app.request("/auth/me", { method: "PATCH", headers: { Cookie: who.cookie, "Content-Type": "application/json" }, body: JSON.stringify(data) });

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  store.objects.clear(); store.deleted.length = 0; store.failPut = false;
});
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Bilder im Object Storage (B-76)", () => {
  it("legt die Bytes im Bucket ab, die Datenbank hält nur Metadaten", async () => {
    const me = await makeUser("anna");
    const res = await upload(me);
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; path: string; contentType: string; size: number };
    expect(body.path).toBe(`/media/${body.id}`);
    const key = `media/${me.id}/${body.id}`;
    expect(store.objects.get(key)?.type).toBe("image/png");
    const [row] = await db.select().from(media).where(eq(media.id, body.id));
    expect(row?.storageKey).toBe(key);
    expect(row?.data).toBeNull();
    expect(row?.size).toBe(PNG.length);
  });

  it("GET leitet auf einen kurzlebigen signierten Link um und hält die Weiterleitung kürzer als der Link gültig ist", async () => {
    const me = await makeUser("anna");
    const { id } = await (await upload(me)).json() as { id: string };
    const res = await app.request(`/media/${id}`, { redirect: "manual", headers: { Cookie: me.cookie } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`https://storage.example.test/signed/media/${me.id}/${id}?X-Amz-Signature=abc`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=1800");
  });

  it("prüft weiter das echte Format (Magic Bytes) – nichts landet im Bucket", async () => {
    const me = await makeUser("anna");
    const res = await upload(me, new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"));
    expect(res.status).toBe(415);
    expect(store.objects.size).toBe(0);
  });

  it("meldet einen nicht erreichbaren Speicher als 502 ohne Datenbankzeile und ohne Details", async () => {
    const me = await makeUser("anna");
    store.failPut = true;
    const res = await upload(me);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("Löschen entfernt Zeile und Objekt; fremde Bilder lassen sich nicht löschen", async () => {
    const me = await makeUser("anna");
    const other = await makeUser("ben");
    const { id } = await (await upload(me)).json() as { id: string };
    const foreign = await app.request(`/media/${id}`, { method: "DELETE", headers: { Cookie: other.cookie } });
    expect(foreign.status).toBe(404);
    expect(store.objects.size).toBe(1);
    const ok = await app.request(`/media/${id}`, { method: "DELETE", headers: { Cookie: me.cookie } });
    expect(ok.status).toBe(200);
    expect(store.deleted).toEqual([`media/${me.id}/${id}`]);
    expect(store.objects.size).toBe(0);
    expect((await app.request(`/media/${id}`, { headers: { Cookie: me.cookie } })).status).toBe(404);
  });
});

describe("Titelbild (B-76)", () => {
  const ref = "/media/11111111-2222-4333-8444-555555555555";
  it("speichert und entfernt das Titelbild; ungültige Quellen werden abgelehnt", async () => {
    const me = await makeUser("anna");
    const set = await patch(me, { cover: ref });
    expect(set.status).toBe(200);
    expect((await set.json() as { cover: string }).cover).toBe(ref);
    expect((await patch(me, { cover: "http://insecure.example/x.jpg" })).status).toBe(400);
    expect((await patch(me, { cover: "javascript:alert(1)" })).status).toBe(400);
    expect((await (await patch(me, { cover: "" })).json() as { cover: string }).cover).toBe("");
  });

  it("zeigt das Titelbild nur, wenn das Profil sichtbar ist", async () => {
    const owner = await makeUser("anna");
    const viewer = await makeUser("ben");
    await patch(owner, { cover: ref });
    const open = await (await app.request("/members/anna", { headers: { Cookie: viewer.cookie } })).json() as Record<string, unknown>;
    expect(open.cover).toBe(ref);
    await patch(owner, { profileVisibility: "followers" });
    const closed = await (await app.request("/members/anna", { headers: { Cookie: viewer.cookie } })).json() as Record<string, unknown>;
    expect(closed.restricted).toBe(true);
    expect(closed).not.toHaveProperty("cover");
  });
});
