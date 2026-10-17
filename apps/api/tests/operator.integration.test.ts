import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { loginEvents, sessions, users } from "../src/db/schema.ts";
import { generatePassword, OperatorError, provisionOperator } from "../src/lib/operator.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

const EMAIL = "Betreiber@Example.Test";
const post = (path: string, data: unknown, cookie?: string) => app.request(path, {
  method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data),
});
const cookieOf = (res: Response) => res.headers.getSetCookie().find((l) => l.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0];

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => { resetRateLimits(); await db.execute(sql`TRUNCATE TABLE users CASCADE`); });
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Betreiber-Bootstrap (B-56)", () => {
  it("legt auf leerer Datenbank einen platform_admin an – ohne Demo-Daten – und das Zufallspasswort funktioniert", async () => {
    const result = await provisionOperator({ email: EMAIL });
    expect(result.action).toBe("created");
    if (result.action !== "created") return;
    expect(result.password).toHaveLength(24);
    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ email: "betreiber@example.test", role: "platform_admin", name: "Betreiber", mustChangePassword: true });
    expect(all[0]!.passwordHash).not.toContain(result.password); // nur der Hash wird gespeichert
    const login = await post("/auth/login", { email: "betreiber@example.test", password: result.password });
    expect(login.status).toBe(200);
    expect((await login.json() as { user: { role: string } }).user.role).toBe("platform_admin");
    const cookie = cookieOf(login)!;
    expect((await app.request("/admin/users", { headers: { Cookie: cookie } })).status).toBe(403); // erst Passwort wechseln (B-58)
    expect((await post("/auth/password", { currentPassword: result.password, newPassword: "neues-eigenes-passwort-1" }, cookie)).status).toBe(204);
    expect((await app.request("/admin/users", { headers: { Cookie: cookie } })).status).toBe(200); // Betreiberroute erreichbar
  });

  it("erzeugt bei jedem Aufruf ein anderes, ausreichend langes Passwort", () => {
    const a = generatePassword(), b = generatePassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });

  it("protokolliert die Bereitstellung als role_changed mit Gerät „Betreiber-CLI“ (ohne Passwort)", async () => {
    const result = await provisionOperator({ email: EMAIL });
    const events = await db.select().from(loginEvents);
    expect(events).toEqual([expect.objectContaining({ event: "role_changed", device: "Betreiber-CLI" })]);
    expect(JSON.stringify(events)).not.toContain((result as { password: string }).password);
  });

  it("verweigert ein bestehendes Konto ohne --promote und ändert nichts", async () => {
    await db.insert(users).values({ name: "Max", email: "betreiber@example.test", handle: "max", passwordHash: await hashPassword("pw-long-enough-123") });
    await expect(provisionOperator({ email: EMAIL })).rejects.toBeInstanceOf(OperatorError);
    expect((await db.select().from(users))[0]!.role).toBe("member");
    expect(await db.select().from(loginEvents)).toHaveLength(0);
  });

  it("befördert mit --promote: Passwort bleibt, alle Sitzungen enden, Ereignis wird protokolliert", async () => {
    const password = "pw-long-enough-123";
    const [u] = await db.insert(users).values({ name: "Max", email: "betreiber@example.test", handle: "max", passwordHash: await hashPassword(password) }).returning();
    const login = await post("/auth/login", { email: "betreiber@example.test", password });
    const old = cookieOf(login)!;
    expect(await db.select().from(sessions).where(eq(sessions.userId, u!.id))).toHaveLength(1);

    expect(await provisionOperator({ email: EMAIL, promote: true })).toEqual({ action: "promoted", email: "betreiber@example.test" });
    expect((await db.select().from(users))[0]!.role).toBe("platform_admin");
    expect(await db.select().from(sessions).where(eq(sessions.userId, u!.id))).toHaveLength(0);
    expect((await app.request("/auth/me", { headers: { Cookie: old } })).status).toBe(401);
    expect((await post("/auth/login", { email: "betreiber@example.test", password })).status).toBe(200); // Passwort unverändert
    expect((await db.select().from(loginEvents).where(eq(loginEvents.event, "role_changed")))).toHaveLength(1);
  });

  it("ist idempotent: ein vorhandener Betreiber bleibt unverändert, auch mit --promote", async () => {
    await provisionOperator({ email: EMAIL });
    const before = (await db.select().from(users))[0]!;
    expect(await provisionOperator({ email: EMAIL, promote: true })).toEqual({ action: "unchanged", email: "betreiber@example.test" });
    expect((await db.select().from(users))[0]!.passwordHash).toBe(before.passwordHash);
    expect(await db.select().from(loginEvents)).toHaveLength(1);
  });

  it("--promote verlangt KEINEN Passwortwechsel (das Passwort des Kontos bleibt)", async () => {
    await db.insert(users).values({ name: "Max", email: "betreiber@example.test", handle: "max", passwordHash: await hashPassword("pw-long-enough-123") });
    await provisionOperator({ email: EMAIL, promote: true });
    expect((await db.select().from(users))[0]!.mustChangePassword).toBe(false);
  });

  it("--reset-password: neues Einmalpasswort für einen vorhandenen Betreiber, Wechsel erzwungen, alle Sitzungen enden", async () => {
    const first = await provisionOperator({ email: EMAIL });
    if (first.action !== "created") throw new Error("expected created");
    const login = await post("/auth/login", { email: "betreiber@example.test", password: first.password });
    const oldCookie = cookieOf(login)!;
    await db.update(users).set({ mustChangePassword: false });

    const reset = await provisionOperator({ email: EMAIL, resetPassword: true });
    expect(reset.action).toBe("reset");
    if (reset.action !== "reset") return;
    expect(reset.password).not.toBe(first.password);
    expect((await db.select().from(users))[0]!.mustChangePassword).toBe(true);
    expect((await app.request("/auth/me", { headers: { Cookie: oldCookie } })).status).toBe(401);
    expect((await post("/auth/login", { email: "betreiber@example.test", password: first.password })).status).toBe(401);
    expect((await post("/auth/login", { email: "betreiber@example.test", password: reset.password })).status).toBe(200);
    const events = await db.select().from(loginEvents).where(eq(loginEvents.event, "password_changed"));
    expect(events).toEqual([expect.objectContaining({ device: "Betreiber-CLI" })]);
    expect(JSON.stringify(events)).not.toContain(reset.password);
  });

  it("--reset-password gilt nur für vorhandene Betreiber (nicht für Mitglieder, nicht für unbekannte Konten)", async () => {
    await db.insert(users).values({ name: "Max", email: "betreiber@example.test", handle: "max", passwordHash: await hashPassword("pw-long-enough-123") });
    await expect(provisionOperator({ email: EMAIL, resetPassword: true })).rejects.toThrow(/kein Betreiber/);
    await expect(provisionOperator({ email: "niemand@example.test", resetPassword: true })).rejects.toThrow(/kein Konto/);
    const [u] = await db.select().from(users);
    expect(u).toMatchObject({ role: "member", mustChangePassword: false });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("lehnt ungültige E-Mail-Adressen ab", async () => {
    await expect(provisionOperator({ email: "kein-email" })).rejects.toBeInstanceOf(OperatorError);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
