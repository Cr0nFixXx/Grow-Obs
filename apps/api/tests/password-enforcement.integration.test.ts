import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { users } from "../src/db/schema.ts";
import { provisionOperator } from "../src/lib/operator.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

const EMAIL = "betreiber@example.test";
const NEW_PASSWORD = "freshly-chosen-password-1";
const req = (path: string, o: { method?: string; cookie?: string; data?: unknown } = {}) => app.request(path, {
  method: o.method ?? "GET",
  headers: { ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.data === undefined ? {} : { "Content-Type": "application/json" }) },
  ...(o.data === undefined ? {} : { body: JSON.stringify(o.data) }),
});
const cookieOf = (res: Response) => res.headers.getSetCookie().find((l) => l.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0];

let oneTime: string;
let cookie: string;
beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  const result = await provisionOperator({ email: EMAIL });
  if (result.action !== "created") throw new Error("expected created");
  oneTime = result.password;
  const login = await req("/auth/login", { method: "POST", data: { email: EMAIL, password: oneTime } });
  expect(login.status).toBe(200);
  cookie = cookieOf(login)!;
});
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Erzwungener Passwortwechsel (B-58)", () => {
  it("meldet das Flag in /auth/me und bei der Anmeldung", async () => {
    const me = await (await req("/auth/me", { cookie })).json() as { mustChangePassword: boolean; role: string };
    expect(me).toMatchObject({ mustChangePassword: true, role: "platform_admin" });
  });

  it.each([
    ["GET", "/grows"], ["GET", "/auth/sessions"], ["GET", "/auth/login-history"], ["GET", "/admin/users"],
    ["PATCH", "/auth/me"], ["POST", "/grows"], ["GET", "/chat/conversations"],
  ])("sperrt %s %s mit 403 und Code password_change_required", async (method, path) => {
    const res = await req(path, { method, cookie, ...(method === "GET" ? {} : { data: {} }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "password_change_required" });
  });

  it("öffentliche Routen behandeln das Konto als anonym (kein Fehler, keine Nutzerdaten)", async () => {
    expect((await req("/forum/threads", { cookie })).status).toBe(200);
  });

  it("erlaubt Abmelden: /auth/logout-all beendet die Sitzung", async () => {
    expect((await req("/auth/logout-all", { method: "POST", cookie })).status).toBe(204);
    expect((await req("/auth/me", { cookie })).status).toBe(401);
  });

  it("falsches aktuelles Passwort → 403 ohne Code, Sperre bleibt", async () => {
    const res = await req("/auth/password", { method: "POST", cookie, data: { currentPassword: "falsch-falsch-falsch", newPassword: NEW_PASSWORD } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Aktuelles Passwort ist falsch" });
    expect((await req("/grows", { cookie })).status).toBe(403);
  });

  it("das Einmalpasswort selbst als neues Passwort wird abgelehnt", async () => {
    const res = await req("/auth/password", { method: "POST", cookie, data: { currentPassword: oneTime, newPassword: oneTime } });
    expect(res.status).toBe(400);
    expect((await db.select().from(users))[0]!.mustChangePassword).toBe(true);
  });

  it("nach dem Wechsel ist die Sperre aufgehoben, die Sitzung bleibt, das Einmalpasswort ist ungültig", async () => {
    const res = await req("/auth/password", { method: "POST", cookie, data: { currentPassword: oneTime, newPassword: NEW_PASSWORD } });
    expect(res.status).toBe(204);
    expect((await db.select().from(users))[0]!.mustChangePassword).toBe(false);
    expect(((await (await req("/auth/me", { cookie })).json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(false);
    expect((await req("/grows", { cookie })).status).toBe(200);
    expect((await req("/admin/users", { cookie })).status).toBe(200);
    expect((await req("/auth/login", { method: "POST", data: { email: EMAIL, password: oneTime } })).status).toBe(401);
    expect((await req("/auth/login", { method: "POST", data: { email: EMAIL, password: NEW_PASSWORD } })).status).toBe(200);
  });

  it("normale Konten sind nie betroffen", async () => {
    await db.insert(users).values({ name: "Max", email: "max@example.test", handle: "max", passwordHash: await hashPassword("pw-long-enough-123") });
    const login = await req("/auth/login", { method: "POST", data: { email: "max@example.test", password: "pw-long-enough-123" } });
    expect(((await login.json()) as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(false);
    expect((await req("/grows", { cookie: cookieOf(login) })).status).toBe(200);
    expect((await db.select().from(users).where(eq(users.email, "max@example.test")))[0]!.mustChangePassword).toBe(false);
  });
});
