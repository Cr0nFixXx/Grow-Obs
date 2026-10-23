import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Object Storage als Speicher im Arbeitsspeicher – das Verhalten des echten Buckets (Supabase S3) ist separat von Hand geprüft.
const store = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; type: string }>(), failPut: false, deleted: [] as string[] }));
vi.mock("../src/lib/s3.ts", async (original) => ({
  ...(await original<typeof import("../src/lib/s3.ts")>()),
  mediaInStorage: () => true,
  putObject: async (key: string, bytes: Uint8Array, type: string) => {
    if (store.failPut) throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    store.objects.set(key, { bytes, type });
  },
  deleteObject: async (key: string) => { store.deleted.push(key); store.objects.delete(key); },
  signedGetUrl: async (key: string) => `https://storage.example.test/signed/${key}?X-Amz-Signature=abc`,
}));

import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import * as schema from "../src/db/schema.ts";
import { media, users } from "../src/db/schema.ts";
import { MEDIA_REFERENCES, sweepOrphanMedia } from "../src/lib/media-cleanup.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

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
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  store.objects.clear(); store.deleted.length = 0; store.failPut = false;
});
afterAll(async () => { await client.end({ timeout: 2 }); });


const SECRET = "cron-secret-for-tests-0123456789";
const upl = async (who: Who) => (await (await upload(who)).json() as { id: string; path: string });
const exists = async (id: string) => (await db.select().from(media).where(eq(media.id, id))).length === 1;
const old = (id: string) => db.execute(sql`update media set created_at = now() - interval '2 days' where id = ${id}`);

describe("Bilder ersetzen (B-78)", () => {
  it("löscht das alte Avatar-Bild (Zeile und Objekt), wenn ein neues gespeichert wird", async () => {
    const me = await makeUser("anna");
    const first = await upl(me); const second = await upl(me);
    await patch(me, { avatar: first.path });
    expect(await exists(first.id)).toBe(true);
    await patch(me, { avatar: second.path });
    expect(await exists(first.id)).toBe(false);
    expect(store.objects.has(`media/${me.id}/${first.id}`)).toBe(false);
    expect(await exists(second.id)).toBe(true);
    expect(store.objects.has(`media/${me.id}/${second.id}`)).toBe(true);
  });

  it("löscht das Titelbild beim Entfernen und lässt gleiche Werte in Ruhe", async () => {
    const me = await makeUser("anna");
    const img = await upl(me);
    await patch(me, { cover: img.path });
    await patch(me, { cover: img.path, bio: "x" });
    expect(await exists(img.id)).toBe(true);
    await patch(me, { cover: "" });
    expect(await exists(img.id)).toBe(false);
    expect(store.objects.size).toBe(0);
  });

  it("behält ein Bild, das noch an anderer Stelle verwendet wird (Avatar = Titelbild)", async () => {
    const me = await makeUser("anna");
    const img = await upl(me);
    await patch(me, { avatar: img.path, cover: img.path });
    await patch(me, { avatar: "" });
    expect(await exists(img.id)).toBe(true);
    await patch(me, { cover: "" });
    expect(await exists(img.id)).toBe(false);
  });

  it("fasst fremde Bilder und externe URLs nie an", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const annas = await upl(anna);
    await patch(ben, { cover: annas.path });
    await patch(ben, { cover: "https://example.org/x.jpg" });
    expect(await exists(annas.id)).toBe(true);
    await patch(ben, { avatar: "https://example.org/a.jpg" });
    await patch(ben, { avatar: "https://example.org/b.jpg" });
    expect(store.deleted).toEqual([]);
  });
});

describe("Verwaiste Bilder (B-78)", () => {
  it("entfernt nur Bilder, die älter als 24 h und nirgends verwendet sind", async () => {
    const me = await makeUser("anna");
    const orphan = await upl(me); const fresh = await upl(me); const used = await upl(me); const oldUsed = await upl(me);
    await patch(me, { cover: oldUsed.path });
    await old(orphan.id); await old(used.id); await old(oldUsed.id);
    expect(await sweepOrphanMedia()).toEqual({ deleted: 2 });
    expect(await exists(orphan.id)).toBe(false);
    expect(await exists(used.id)).toBe(false);
    expect(await exists(fresh.id)).toBe(true);
    expect(await exists(oldUsed.id)).toBe(true);
    expect(store.objects.has(`media/${me.id}/${orphan.id}`)).toBe(false);
    expect(store.objects.has(`media/${me.id}/${fresh.id}`)).toBe(true);
  });

  it("GET /cron/media-cleanup: ohne Secret 404, falsches 401, richtiges räumt auf", async () => {
    const me = await makeUser("anna");
    const orphan = await upl(me); await old(orphan.id);
    delete process.env.CRON_SECRET;
    expect((await app.request("/cron/media-cleanup")).status).toBe(404);
    process.env.CRON_SECRET = SECRET;
    try {
      expect((await app.request("/cron/media-cleanup")).status).toBe(401);
      expect((await app.request("/cron/media-cleanup", { headers: { Authorization: "Bearer falsch" } })).status).toBe(401);
      const ok = await app.request("/cron/media-cleanup", { headers: { Authorization: `Bearer ${SECRET}` } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ deleted: 1 });
    } finally { delete process.env.CRON_SECRET; }
  });

  it("MEDIA_REFERENCES deckt jede Bildspalte des Schemas ab (sonst würden Bilder fälschlich als Waisen gelöscht)", () => {
    const found = new Set<string>();
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const cfg = getTableConfig(value);
      for (const col of cfg.columns) if (/(avatar_url|cover_url|image_url)$/.test(col.name) || (cfg.name === "grow_photos" && col.name === "url")) found.add(`${cfg.name}.${col.name}`);
    }
    expect([...found].sort()).toEqual(MEDIA_REFERENCES.map(([t, c]) => `${t}.${c}`).sort());
  });
});
