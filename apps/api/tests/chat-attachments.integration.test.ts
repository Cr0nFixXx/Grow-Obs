import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Teil der Tests nutzt den Bucket (signierter Link mit Download-Kopfzeile); er liegt hier im Arbeitsspeicher.
const store = vi.hoisted(() => ({ storage: false, objects: new Map<string, Uint8Array>(), lastSigned: null as null | { key: string; response: { disposition?: string; contentType?: string } } }));
vi.mock("../src/lib/s3.ts", async (original) => ({
  ...(await original<typeof import("../src/lib/s3.ts")>()),
  mediaInStorage: () => store.storage,
  putObject: async (key: string, bytes: Uint8Array) => { store.objects.set(key, bytes); },
  deleteObject: async (key: string) => { store.objects.delete(key); },
  signedGetUrl: async (key: string, _ttl?: number, response: { disposition?: string; contentType?: string } = {}) => { store.lastSigned = { key, response }; return `https://storage.example.test/signed/${key}`; },
}));

import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { media, messages, users } from "../src/db/schema.ts";
import { MEDIA_REFERENCES, sweepOrphanMedia } from "../src/lib/media-cleanup.ts";
import { attachmentLabel } from "../src/routes/chat.ts";
import { sanitizeFileName, sniffFile, contentDisposition, uploadConfig, uploadMaxBytes, mediaQuotaBytes } from "../src/lib/media-files.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);

async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await app.request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${key}@example.org`, password: PASSWORD }) });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const up = (who: Who, body: Uint8Array, query = "", type = "application/octet-stream") => app.request(`/media${query}`, { method: "POST", headers: { Cookie: who.cookie, "Content-Type": type }, body });
const file = (who: Who, name: string, body: Uint8Array) => up(who, body, `?kind=file&name=${encodeURIComponent(name)}`);
const call = (who: Who, path: string, method = "GET", body?: unknown) => app.request(path, { method, headers: { Cookie: who.cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function directChat(a: Who, b: Who) {
  const res = await call(a, "/chat", "POST", { userId: b.id });
  return ((await res.json()) as { id: string }).id;
}

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  store.storage = false; store.objects.clear(); store.lastSigned = null;
});
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Datei-Hilfen (B-81)", () => {
  it("prüft Endung und Inhalt, säubert Namen", () => {
    expect(sniffFile("a.pdf", PDF)).toBe("application/pdf");
    expect(sniffFile("a.pdf", ZIP)).toBeNull();
    expect(sniffFile("a.docx", ZIP)).toContain("wordprocessingml");
    expect(sniffFile("a.exe", EXE)).toBeNull();
    expect(sniffFile("a.html", new TextEncoder().encode("<script>"))).toBeNull();
    expect(sniffFile("notiz.txt", new TextEncoder().encode("Grüße"))).toBe("text/plain");
    expect(sniffFile("notiz.txt", new Uint8Array([65, 0, 66]))).toBeNull();
    expect(sanitizeFileName("../../etc/pa:ss*wd.pdf")).toBe("etc pa ss wd.pdf");
    expect(sanitizeFileName(`${"x".repeat(200)}.pdf`)).toHaveLength(120);
    expect(sanitizeFileName(`${"x".repeat(200)}.pdf`).endsWith(".pdf")).toBe(true);
    expect(contentDisposition("attachment", 'Übersicht "Q3".pdf')).toBe(`attachment; filename="_bersicht _Q3_.pdf"; filename*=UTF-8''%C3%9Cbersicht%20%22Q3%22.pdf`);
  });
  it("Grenzen: eigener Host 50 MB mit HD, Vercel höchstens 4,4 MB ohne HD", () => {
    expect(uploadConfig()).toEqual({ maxBytes: 50 * 1048576, hdAllowed: true });
    expect(mediaQuotaBytes()).toBe(1000 * 1048576);
    process.env.VERCEL = "1";
    try {
      expect(uploadMaxBytes()).toBe(Math.floor(4 * 1048576));
      expect(uploadConfig().hdAllowed).toBe(false);
      expect(mediaQuotaBytes()).toBe(100 * 1048576);
    } finally { delete process.env.VERCEL; }
  });
  it("Vorschautext der Konversationsliste", () => {
    const img = { path: "/media/a", kind: "image" as const, name: "", size: 1, mime: "image/png" };
    const doc = { path: "/media/b", kind: "file" as const, name: "Plan.pdf", size: 1, mime: "application/pdf" };
    expect(attachmentLabel([img], null)).toBe("📷 Bild");
    expect(attachmentLabel([img, img, img], null)).toBe("📷 3 Bilder");
    expect(attachmentLabel([doc], null)).toBe("📎 Plan.pdf");
    expect(attachmentLabel([doc, doc], null)).toBe("📎 2 Dateien");
    expect(attachmentLabel([img, doc], null)).toBe("📎 2 Anhänge");
    expect(attachmentLabel([], "/media/x")).toBe("📷 Bild");
    expect(attachmentLabel([], null)).toBe("");
  });
});

describe("Upload von Dateien (B-81)", () => {
  it("liefert die Grenzen für die Oberfläche", async () => {
    const res = await app.request("/media/config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maxBytes: 50 * 1048576, hdAllowed: true });
  });

  it("nimmt PDF/ZIP nur mit kind=file an, ohne den Parameter bleibt es bei Bildern", async () => {
    const me = await makeUser("anna");
    const ok = await file(me, "Plan Woche 3.pdf", PDF);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ kind: "file", name: "Plan Woche 3.pdf", contentType: "application/pdf", size: PDF.length });
    expect((await file(me, "daten.zip", ZIP)).status).toBe(201);
    expect((await up(me, PDF, "", "application/pdf")).status).toBe(415); // z. B. Avatar-Upload
    expect((await file(me, "virus.exe", EXE)).status).toBe(415);
    expect((await file(me, "bild.html", new TextEncoder().encode("<h1>x</h1>"))).status).toBe(415);
    const fake = await file(me, "fake.pdf", ZIP);
    expect(fake.status).toBe(415);
    expect(((await fake.json()) as { error: string }).error).toMatch(/passt nicht/);
    expect((await file(me, "leer.pdf", new Uint8Array())).status).toBe(400);
  });

  it("Bilder bleiben Bilder, auch mit kind=file", async () => {
    const me = await makeUser("anna");
    const res = await file(me, "foto.png", PNG);
    expect(await res.json()).toMatchObject({ kind: "image", contentType: "image/png" });
  });

  it("lehnt zu große Dateien ab", async () => {
    const me = await makeUser("anna");
    const big = new Uint8Array(51 * 1048576); big.set(PDF);
    const res = await file(me, "gross.pdf", big);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain("max. 50 MB");
  });

  it("Datei wird beim Abruf immer als Download ausgeliefert (Datenbank-Speicher)", async () => {
    const me = await makeUser("anna");
    const { id } = (await (await file(me, "Übersicht.pdf", PDF)).json()) as { id: string };
    const res = await app.request(`/media/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain(`filename*=UTF-8''%C3%9Cbersicht.pdf`);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // Bild: inline, mit ?download=1 als Download
    const img = (await (await up(me, PNG, "", "image/png")).json()) as { id: string };
    expect((await app.request(`/media/${img.id}`)).headers.get("Content-Disposition")).toBe("inline");
    expect((await app.request(`/media/${img.id}?download=1`)).headers.get("Content-Disposition")).toMatch(/^attachment; filename="bild-[0-9a-f]{8}\.png"/);
  });

  it("Bucket: signierter Link trägt Download-Kopfzeile und Typ", async () => {
    store.storage = true;
    const me = await makeUser("anna");
    const { id } = (await (await file(me, "Plan.pdf", PDF)).json()) as { id: string };
    const res = await app.request(`/media/${id}`);
    expect(res.status).toBe(302);
    expect(store.lastSigned?.response.disposition).toMatch(/^attachment; filename="Plan.pdf"/);
    expect(store.lastSigned?.response.contentType).toBe("application/pdf");
    const img = (await (await up(me, PNG, "", "image/png")).json()) as { id: string };
    await app.request(`/media/${img.id}`);
    expect(store.lastSigned?.response).toEqual({});
  });
});

describe("Nachrichten mit Anhängen (B-81)", () => {
  it("sendet mehrere Bilder und eine Datei; Art, Name und Größe kommen vom Server", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await directChat(anna, ben);
    const ids = [] as string[];
    for (const body of [PNG, PNG]) ids.push(((await (await up(anna, body, "", "image/png")).json()) as { id: string }).id);
    ids.push(((await (await file(anna, "Plan.pdf", PDF)).json()) as { id: string }).id);
    const res = await call(anna, `/chat/${chat}/messages`, "POST", { text: "", attachments: ids.map((id) => `/media/${id}`) });
    expect(res.status).toBe(201);
    const msg = (await res.json()) as { attachments: { path: string; kind: string; name: string; size: number }[]; image: string };
    expect(msg.attachments.map((a) => a.kind)).toEqual(["image", "image", "file"]);
    expect(msg.attachments[2]).toMatchObject({ name: "Plan.pdf", size: PDF.length, mime: "application/pdf" });
    expect(msg.image).toBe(`/media/${ids[0]}`);

    const list = (await (await call(ben, `/chat/${chat}/messages`)).json()) as { attachments: unknown[] }[];
    expect(list[0]!.attachments).toHaveLength(3);
    const conv = (await (await call(ben, "/chat")).json()) as { last: string }[];
    expect(conv[0]!.last).toBe("📎 3 Anhänge");
  });

  it("alte Nachrichten mit nur image_url erscheinen als einzelnes Bild", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await directChat(anna, ben);
    const sent = await call(anna, `/chat/${chat}/messages`, "POST", { text: "", image: "https://example.org/a.jpg" });
    expect(sent.status).toBe(201);
    const list = (await (await call(ben, `/chat/${chat}/messages`)).json()) as { attachments: { path: string; kind: string }[] }[];
    expect(list[0]!.attachments).toEqual([{ path: "https://example.org/a.jpg", kind: "image", name: "", size: 0, mime: "" }]);
  });

  it("lehnt fremde, unbekannte und zu viele Anhänge ab", async () => {
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await directChat(anna, ben);
    const bens = ((await (await up(ben, PNG, "", "image/png")).json()) as { id: string }).id;
    const own = ((await (await up(anna, PNG, "", "image/png")).json()) as { id: string }).id;
    const send = (attachments: string[]) => call(anna, `/chat/${chat}/messages`, "POST", { text: "x", attachments });
    expect((await send([`/media/${bens}`])).status).toBe(400);
    expect((await send(["/media/00000000-0000-4000-8000-000000000000"])).status).toBe(400);
    expect((await send(["https://example.org/x"])).status).toBe(400);
    expect((await send(Array.from({ length: 11 }, () => `/media/${own}`))).status).toBe(400);
    expect((await send([`/media/${own}`, `/media/${own}`])).status).toBe(201); // doppelt → einmal
    expect((await call(anna, `/chat/${chat}/messages`, "POST", { text: "" })).status).toBe(400);
  });

  it("Anhänge zählen als verwendet: die Bereinigung löscht sie nicht", async () => {
    store.storage = true;
    const anna = await makeUser("anna"); const ben = await makeUser("ben");
    const chat = await directChat(anna, ben);
    const used = ((await (await file(anna, "Plan.pdf", PDF)).json()) as { id: string }).id;
    const lost = ((await (await file(anna, "Weg.pdf", PDF)).json()) as { id: string }).id;
    await call(anna, `/chat/${chat}/messages`, "POST", { text: "", attachments: [`/media/${used}`] });
    await db.execute(sql`update media set created_at = now() - interval '3 days'`);
    expect(await sweepOrphanMedia()).toEqual({ deleted: 1 });
    expect((await db.select().from(media).where(eq(media.id, used))).length).toBe(1);
    expect((await db.select().from(media).where(eq(media.id, lost))).length).toBe(0);
    expect(MEDIA_REFERENCES.some(([t, c]) => t === "messages" && c === "attachments")).toBe(true);
    expect((await db.select().from(messages)).length).toBe(1);
  });
});
