import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { messages, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";

function call(path: string, { method = "GET", cookie, data }: { method?: string; cookie?: string; data?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await call("/auth/login", { method: "POST", data: { email: `${key}@example.org`, password: PASSWORD } });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, handle: key, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const json = async <T = any>(res: Response) => (await res.json()) as T;

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, conversations CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 2 }); });

async function direct(a: Who, b: Who) {
  const conv = await json(await call("/chat", { method: "POST", cookie: a.cookie, data: { userId: b.id } }));
  return conv.id as string;
}
const send = (who: Who, conv: string, data: Record<string, unknown>) => call(`/chat/${conv}/messages`, { method: "POST", cookie: who.cookie, data });
const list = async (who: Who, conv: string) => json<any[]>(await call(`/chat/${conv}/messages`, { cookie: who.cookie }));

describe("Chat-Antworten mit Zitat (B-94)", () => {
  it("Antwort trägt ein Zitat (Absender, gekürzter Text); die Gegenseite sieht es mit eigener Perspektive", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("ben");
    const conv = await direct(a, b);
    const first = await json(await send(a, conv, { text: "x".repeat(300) }));
    const res = await send(b, conv, { text: "Antwort", replyTo: first.id });
    expect(res.status).toBe(201);
    const posted = await json(res);
    expect(posted.replyTo).toMatchObject({ id: first.id, from: "them", deleted: false, hasAttachment: false });
    expect(posted.replyTo.text.length).toBe(140);
    const forAnna = (await list(a, conv)).find((m) => m.id === posted.id);
    expect(forAnna.replyTo).toMatchObject({ id: first.id, from: "me", senderName: "Name anna" });
    expect(forAnna.senderHandle).toBe("ben");
    expect((await list(a, conv)).find((m) => m.id === first.id).replyTo).toBeNull();
  });

  it("lehnt Antworten auf unbekannte, fremde, gelöschte Nachrichten ab (400)", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("ben");
    const c = await makeUser("cleo");
    const conv = await direct(a, b);
    const other = await direct(a, c);
    const m = await json(await send(a, conv, { text: "Hallo" }));
    const foreign = await json(await send(a, other, { text: "Anderer Chat" }));
    expect((await send(b, conv, { text: "x", replyTo: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
    expect((await send(b, conv, { text: "x", replyTo: foreign.id })).status).toBe(400);
    expect((await send(b, conv, { text: "x", replyTo: "kaputt" })).status).toBe(400);
    expect((await call(`/chat/${conv}/messages/${m.id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(204);
    expect((await send(b, conv, { text: "x", replyTo: m.id })).status).toBe(400);
  });

  it("wird das Original später gelöscht, bleibt nur ein Platzhalter im Zitat (kein Text)", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("ben");
    const conv = await direct(a, b);
    const m = await json(await send(a, conv, { text: "Geheimnis" }));
    const reply = await json(await send(b, conv, { text: "ok", replyTo: m.id }));
    await call(`/chat/${conv}/messages/${m.id}`, { method: "DELETE", cookie: a.cookie });
    const shown = (await list(b, conv)).find((x) => x.id === reply.id);
    expect(shown.replyTo).toMatchObject({ id: m.id, deleted: true, text: "" });
  });

  it("wird das Original endgültig entfernt, bleibt die Antwort ohne Zitat stehen", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("ben");
    const conv = await direct(a, b);
    const m = await json(await send(a, conv, { text: "Weg" }));
    const reply = await json(await send(b, conv, { text: "bleibt", replyTo: m.id }));
    await db.delete(messages).where(eq(messages.id, m.id));
    const shown = (await list(b, conv)).find((x) => x.id === reply.id);
    expect(shown.text).toBe("bleibt");
    expect(shown.replyTo).toBeNull();
  });
});
