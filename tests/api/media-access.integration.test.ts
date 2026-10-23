import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Bucket im Arbeitsspeicher (Teil der Tests prüft den PDF-Abruf über die API aus dem Bucket).
const store = vi.hoisted(() => ({ storage: false, objects: new Map<string, Uint8Array>(), deleted: [] as string[] }));
vi.mock("../../apps/api/src/lib/s3.ts", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/lib/s3.ts")>()),
  mediaInStorage: () => store.storage,
  putObject: async (key: string, bytes: Uint8Array) => { store.objects.set(key, bytes); },
  deleteObject: async (key: string) => { store.deleted.push(key); store.objects.delete(key); },
  signedGetUrl: async (key: string) => `https://storage.example.test/signed/${key}`,
  getObjectStream: async (key: string) => new Response(store.objects.get(key)).body!,
}));

import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { conversationMembers, conversationTopics, conversations, media, messages, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0]);

async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await app.request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${key}@example.org`, password: PASSWORD }) });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const call = (who: Who | null, path: string, method = "GET", body?: unknown) =>
  app.request(path, { method, headers: { ...(who ? { Cookie: who.cookie } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const up = async (who: Who, body: Uint8Array, kind: "image" | "file" = "image", name = "Plan.pdf") => {
  const res = await app.request(kind === "file" ? `/media?kind=file&name=${encodeURIComponent(name)}` : "/media", { method: "POST", headers: { Cookie: who.cookie, "Content-Type": kind === "image" ? "image/png" : "application/octet-stream" }, body });
  return (await res.json()) as { id: string; path: string };
};
const direct = async (a: Who, b: Who) => ((await (await call(a, "/chat", "POST", { userId: b.id })).json()) as { id: string }).id;
const send = async (who: Who, chat: string, attachments: string[], text = "") => (await (await call(who, `/chat/${chat}/messages`, "POST", { text, attachments })).json()) as { id: string };
const history = async (who: Who, chat: string) => (await (await call(who, `/chat/${chat}/messages`)).json()) as { id: string; text: string; deleted?: boolean; attachments: { path: string }[] }[];

/** Gruppe mit Standardthema und Rollen direkt in der Datenbank (die Einladungswege sind in groups.integration.test.ts abgedeckt). */
async function group(admin: Who, members: Who[]) {
  const [cv] = await db.insert(conversations).values({ name: "Beet-Team", isGroup: true, createdBy: admin.id }).returning({ id: conversations.id });
  await db.insert(conversationMembers).values([{ conversationId: cv!.id, userId: admin.id, role: "admin" as const }, ...members.map((m) => ({ conversationId: cv!.id, userId: m.id }))]);
  await db.insert(conversationTopics).values({ conversationId: cv!.id, name: "Allgemein", isDefault: true });
  return cv!.id;
}

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  store.storage = false; store.objects.clear(); store.deleted = [];
});
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Medien nur mit Login, Chat-Anhänge nur für Mitglieder (B-82)", () => {
  it("ohne Anmeldung kein Abruf – weder Bild noch Datei noch PDF-Vorschau", async () => {
    const anna = await makeUser("anna");
    const img = await up(anna, PNG);
    const pdf = await up(anna, PDF, "file");
    for (const path of [img.path, `${pdf.path}`, `${pdf.path}?raw=1`, `${img.path}?download=1`]) expect((await call(null, path)).status).toBe(401);
    expect((await call(anna, img.path)).status).toBe(200);
  });

  it("freie Bilder (Avatar, Beitrag) sehen alle Angemeldeten; Chat-Anhänge nur Mitglieder und Absender", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben"); const cleo = await makeUser("cleo");
    const avatar = await up(anna, PNG);
    expect((await call(cleo, avatar.path)).status).toBe(200); // nicht im Chat gesendet → nur Login nötig
    const chat = await direct(anna, ben);
    const img = await up(anna, PNG); const pdf = await up(anna, PDF, "file");
    await send(anna, chat, [img.path, pdf.path]);
    const [row] = await db.select().from(media).where(eq(media.id, img.id));
    expect(row?.conversationId).toBe(chat);
    for (const path of [img.path, pdf.path, `${pdf.path}?raw=1`]) {
      expect((await call(anna, path)).status).toBe(200);
      expect((await call(ben, path)).status).toBe(200);
      expect((await call(cleo, path)).status).toBe(404); // Fremde erfahren nicht einmal, dass es sie gibt
    }
    expect((await call(cleo, avatar.path)).status).toBe(200);
  });

  it("PDF-Vorschau über die API: Datenbank und Bucket, nur PDF, nie als Seite gerendert", async () => {
    const anna = await makeUser("anna");
    const pdf = await up(anna, PDF, "file");
    const zip = await up(anna, ZIP, "file", "Daten.zip");
    let res = await call(anna, `${pdf.path}?raw=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect((await call(anna, `${zip.path}?raw=1`)).status).toBe(400);
    store.storage = true;
    const inBucket = await up(anna, PDF, "file");
    res = await call(anna, `${inBucket.path}?raw=1`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect((await call(anna, inBucket.path)).status).toBe(302); // ohne raw weiter über den signierten Link
  });

  it("Migration 0019 ordnet bereits gesendete Anhänge ihrer Unterhaltung zu (Bestand)", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await direct(anna, ben);
    const old = await up(anna, PNG); const legacy = await up(anna, PNG); const free = await up(anna, PNG);
    await db.insert(messages).values([
      { conversationId: chat, senderId: anna.id, text: "", attachments: [{ path: old.path, kind: "image", name: "", size: 1, mime: "image/png" }] },
      { conversationId: chat, senderId: anna.id, text: "", imageUrl: legacy.path },
    ]);
    const sqlText = (await import("node:fs")).readFileSync(fileURLToPath(new URL("../../apps/api/drizzle/0019_media_access_message_delete.sql", import.meta.url)), "utf8");
    await db.execute(sql.raw(sqlText));
    const rows = new Map((await db.select().from(media)).map((r) => [r.id, r.conversationId]));
    expect(rows.get(old.id)).toBe(chat);
    expect(rows.get(legacy.id)).toBe(chat);
    expect(rows.get(free.id)).toBeNull();
  });
});

describe("Nachrichten löschen (B-82)", () => {
  it("Absender löscht für alle: Inhalt weg, Platzhalter bleibt, Dateien aus Speicher und Datenbank entfernt", async () => {
    store.storage = true;
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await direct(anna, ben);
    const img = await up(anna, PNG); const pdf = await up(anna, PDF, "file");
    const { id } = await send(anna, chat, [img.path, pdf.path], "Geheim");
    expect((await call(anna, `/chat/${chat}/messages/${id}`, "DELETE")).status).toBe(204);
    for (const who of [anna, ben]) {
      const [m] = await history(who, chat);
      expect(m).toMatchObject({ id, text: "", deleted: true, attachments: [] });
    }
    expect(await db.select().from(media)).toHaveLength(0);
    expect(store.deleted.sort()).toHaveLength(2);
    expect((await call(ben, img.path)).status).toBe(404);
    const [row] = await db.select().from(messages).where(eq(messages.id, id));
    expect(row).toMatchObject({ text: "", imageUrl: null, attachments: [] });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    // zweites Löschen ist harmlos; Konversationsliste zeigt den Platzhalter
    expect((await call(anna, `/chat/${chat}/messages/${id}`, "DELETE")).status).toBe(204);
    const list = (await (await call(ben, "/chat")).json()) as { last: string }[];
    expect(list[0]?.last).toBe("🚫 Nachricht gelöscht");
  });

  it("fremde Nachrichten: nur der Absender; Nicht-Mitglieder und Hinweiszeilen nie", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben"); const cleo = await makeUser("cleo");
    const chat = await direct(anna, ben);
    const { id } = await send(anna, chat, [], "Hallo");
    expect((await call(ben, `/chat/${chat}/messages/${id}`, "DELETE")).status).toBe(403);
    expect((await call(cleo, `/chat/${chat}/messages/${id}`, "DELETE")).status).toBe(404);
    expect((await call(anna, `/chat/${chat}/messages/00000000-0000-4000-8000-000000000000`, "DELETE")).status).toBe(404);
    expect((await history(ben, chat))[0]?.text).toBe("Hallo");
    const [sys] = await db.insert(messages).values({ conversationId: chat, senderId: anna.id, text: "Hinweis", kind: "system" }).returning({ id: messages.id });
    expect((await call(anna, `/chat/${chat}/messages/${sys!.id}`, "DELETE")).status).toBe(400);
  });

  it("Gruppen: Admins löschen auch fremde Nachrichten, normale Mitglieder nicht", async () => {
    store.storage = true;
    const admin = await makeUser("admin1"); const ben = await makeUser("ben"); const cleo = await makeUser("cleo");
    const g = await group(admin, [ben, cleo]);
    const pdf = await up(ben, PDF, "file");
    const sent = await send(ben, g, [pdf.path], "Plan");
    expect((await call(cleo, `/chat/${g}/messages/${sent.id}`, "DELETE")).status).toBe(403);
    expect((await call(admin, `/chat/${g}/messages/${sent.id}`, "DELETE")).status).toBe(204);
    expect((await history(cleo, g))[0]).toMatchObject({ deleted: true, text: "", attachments: [] });
    expect(await db.select().from(media).where(eq(media.id, pdf.id))).toHaveLength(0);
  });

  it("Datei in zweiter Nachricht wiederverwendet: wird beim Löschen der ersten nicht entfernt", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await direct(anna, ben);
    const pdf = await up(anna, PDF, "file");
    const first = await send(anna, chat, [pdf.path], "a");
    await send(anna, chat, [pdf.path], "b");
    expect((await call(anna, `/chat/${chat}/messages/${first.id}`, "DELETE")).status).toBe(204);
    expect(await db.select().from(media).where(eq(media.id, pdf.id))).toHaveLength(1);
  });
});
