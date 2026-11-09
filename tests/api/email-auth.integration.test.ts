import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { authTokens, loginEvents, sessions, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { clearOutbox, outbox } from "../../apps/api/src/lib/mailer.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const NEW_PASSWORD = "another-long-password-42";

function call(path: string, { method = "GET", cookie, data }: { method?: string; cookie?: string; data?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const cookieOf = (res: Response) => res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!.split(";")[0]!;
async function register(email: string) {
  const res = await call("/auth/register", { method: "POST", data: { name: "Mail Tester", email, password: PASSWORD } });
  return { res, cookie: res.status === 201 ? cookieOf(res) : "" };
}
async function login(email: string, password = PASSWORD) {
  const res = await call("/auth/login", { method: "POST", data: { email, password } });
  return { res, cookie: res.status === 200 ? cookieOf(res) : "" };
}
/** Token aus der letzten Mail an `to` (Link-Form `/#verify=…` bzw. `/#reset=…`). */
function tokenFor(to: string, kind: "verify" | "reset"): string {
  const mail = [...outbox].reverse().find((m) => m.to === to);
  const match = mail && new RegExp(`#${kind}=([A-Za-z0-9_-]+)`).exec(mail.text);
  if (!match) throw new Error(`keine ${kind}-Mail an ${to}`);
  return match[1]!;
}
const dbUser = async (email: string) => (await db.query.users.findFirst({ where: eq(users.email, email) }))!;

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  clearOutbox();
  process.env.MAIL_TRANSPORT = "memory";
});
afterEach(() => { delete process.env.MAIL_TRANSPORT; });
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("ohne Mailversand (nichts konfiguriert)", () => {
  beforeEach(() => { delete process.env.MAIL_TRANSPORT; });

  it("Registrierung wie bisher: keine Pflicht, keine Mail; /me meldet nichts Offenes", async () => {
    const { res, cookie } = await register("plain@example.invalid");
    expect(res.status).toBe(201);
    expect(outbox).toHaveLength(0);
    const me = await (await call("/auth/me", { cookie })).json() as { emailVerified: boolean; emailVerificationPending: boolean };
    expect(me).toMatchObject({ emailVerified: false, emailVerificationPending: false });
    expect((await call("/notifications", { cookie })).status).toBe(200);
  });

  it("Passwort vergessen, Erneut senden und Adresse ändern antworten ehrlich mit 503", async () => {
    const { cookie } = await register("plain2@example.invalid");
    expect((await call("/auth/forgot-password", { method: "POST", data: { email: "plain2@example.invalid" } })).status).toBe(503);
    expect((await call("/auth/resend-verification", { method: "POST", cookie })).status).toBe(503);
    expect((await call("/auth/email", { method: "POST", cookie, data: { newEmail: "x@example.invalid", password: PASSWORD } })).status).toBe(503);
  });
});

describe("E-Mail-Bestätigung (Pflicht, sobald Mails möglich sind)", () => {
  it("Registrierung schickt einen Link; bis zur Bestätigung ist alles außer /me, Erneut senden, Adresse, Passwort und Abmelden gesperrt", async () => {
    const { res, cookie } = await register("new@example.invalid");
    expect(res.status).toBe(201);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.subject).toMatch(/bestätige/i);
    expect(outbox[0]!.text).toContain("/#verify=");

    const me = await (await call("/auth/me", { cookie })).json() as { email: string; emailVerified: boolean; emailVerificationPending: boolean };
    expect(me).toMatchObject({ email: "new@example.invalid", emailVerified: false, emailVerificationPending: true });
    const blocked = await call("/notifications", { cookie });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "email_unverified" });
    expect((await call("/auth/sessions", { cookie })).status).toBe(403);
    expect((await call("/auth/logout", { method: "POST", cookie })).status).toBe(204);
  });

  it("der Link bestätigt einmalig und schaltet das Konto frei", async () => {
    const { cookie } = await register("verify@example.invalid");
    const token = tokenFor("verify@example.invalid", "verify");
    const ok = await call("/auth/verify-email", { method: "POST", data: { token } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ kind: "verify_email" });
    expect((await dbUser("verify@example.invalid")).emailVerifiedAt).not.toBeNull();
    expect((await call("/notifications", { cookie })).status).toBe(200);
    expect((await call("/auth/verify-email", { method: "POST", data: { token } })).status).toBe(400); // einmalig
  });

  it("falsche, abgelaufene und fremdartige Tokens werden gleich abgewiesen; in der DB steht nur der Hash", async () => {
    await register("expired@example.invalid");
    const token = tokenFor("expired@example.invalid", "verify");
    const [row] = await db.select().from(authTokens);
    expect(row!.tokenHash).not.toContain(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await call("/auth/verify-email", { method: "POST", data: { token } })).status).toBe(400);
    expect((await call("/auth/verify-email", { method: "POST", data: { token: "x".repeat(43) } })).status).toBe(400);
    expect((await call("/auth/verify-email", { method: "POST", data: {} })).status).toBe(400);
    // Ein Bestätigungs-Token taugt nicht als Reset-Link.
    await register("kind@example.invalid");
    const other = tokenFor("kind@example.invalid", "verify");
    expect((await call("/auth/reset-password", { method: "POST", data: { token: other, newPassword: NEW_PASSWORD } })).status).toBe(400);
  });

  it("Erneut senden: neuer Link gilt, der alte nicht; höchstens 3 je 15 Minuten", async () => {
    const { cookie } = await register("again@example.invalid");
    const first = tokenFor("again@example.invalid", "verify");
    expect((await call("/auth/resend-verification", { method: "POST", cookie })).status).toBe(204);
    const second = tokenFor("again@example.invalid", "verify");
    expect(second).not.toBe(first);
    expect((await call("/auth/verify-email", { method: "POST", data: { token: first } })).status).toBe(400);
    expect((await call("/auth/verify-email", { method: "POST", data: { token: second } })).status).toBe(200);
    // bestätigt: Erneut senden ist ein stilles No-op
    const count = outbox.length;
    expect((await call("/auth/resend-verification", { method: "POST", cookie })).status).toBe(204);
    expect(outbox).toHaveLength(count);
  });

  it("Erneut senden ist begrenzt", async () => {
    const { cookie } = await register("limit@example.invalid");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await call("/auth/resend-verification", { method: "POST", cookie })).status);
    expect(statuses).toEqual([204, 204, 204, 429]);
  });

  it("Betreiber kann eine Adresse von Hand bestätigen (nur Plattform-Admin)", async () => {
    const [admin] = await db.insert(users).values({ email: "op@example.invalid", name: "Op", handle: "op_admin", passwordHash: await hashPassword(PASSWORD), role: "platform_admin", emailVerifiedAt: new Date() }).returning();
    const { cookie } = await register("manual@example.invalid");
    const target = await dbUser("manual@example.invalid");
    const adminCookie = (await login(admin!.email)).cookie;
    expect((await call(`/admin/users/${target.id}/verify-email`, { method: "POST", cookie })).status).toBe(403);
    expect((await call(`/admin/users/${target.id}/verify-email`, { method: "POST", cookie: adminCookie })).status).toBe(204);
    expect((await call("/notifications", { cookie })).status).toBe(200);
    const listed = await (await call("/admin/users?q=manual", { cookie: adminCookie })).json() as { emailVerified: boolean }[];
    expect(listed[0]!.emailVerified).toBe(true);
  });
});

describe("Passwort vergessen", () => {
  async function verifiedUser(email: string) {
    await register(email);
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor(email, "verify") } });
    clearOutbox();
  }

  it("antwortet für unbekannte und bekannte Adressen gleich (204), verschickt aber nur an bekannte", async () => {
    await verifiedUser("known@example.invalid");
    const unknown = await call("/auth/forgot-password", { method: "POST", data: { email: "nobody@example.invalid" } });
    expect(unknown.status).toBe(204);
    expect(outbox).toHaveLength(0);
    const known = await call("/auth/forgot-password", { method: "POST", data: { email: "KNOWN@example.invalid" } });
    expect(known.status).toBe(204);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "known@example.invalid", subject: "Passwort zurücksetzen" });
    expect(outbox[0]!.text).toContain("1 Stunde");
    expect((await call("/auth/forgot-password", { method: "POST", data: { email: "kaputt" } })).status).toBe(400);
  });

  it("Reset setzt das Passwort, beendet ALLE Sitzungen, entwertet den Link und protokolliert das Ereignis", async () => {
    await verifiedUser("reset@example.invalid");
    const a = (await login("reset@example.invalid")).cookie;
    const b = (await login("reset@example.invalid")).cookie;
    await call("/auth/forgot-password", { method: "POST", data: { email: "reset@example.invalid" } });
    const token = tokenFor("reset@example.invalid", "reset");

    expect((await call("/auth/reset-password", { method: "POST", data: { token, newPassword: "short" } })).status).toBe(400);
    expect((await call("/auth/reset-password", { method: "POST", data: { token, newPassword: NEW_PASSWORD } })).status).toBe(204); // Tippfehler oben hat den Link nicht verbraucht

    expect((await call("/auth/me", { cookie: a })).status).toBe(401);
    expect((await call("/auth/me", { cookie: b })).status).toBe(401);
    expect((await login("reset@example.invalid", PASSWORD)).res.status).toBe(401);
    expect((await login("reset@example.invalid", NEW_PASSWORD)).res.status).toBe(200);
    expect((await call("/auth/reset-password", { method: "POST", data: { token, newPassword: NEW_PASSWORD + "x" } })).status).toBe(400);

    const events = await db.select().from(loginEvents).where(eq(loginEvents.userId, (await dbUser("reset@example.invalid")).id));
    expect(events.map((e) => e.event)).toContain("password_reset");
  });

  it("abgelaufener Reset-Link (nach 1 Stunde) wird abgewiesen", async () => {
    await verifiedUser("late@example.invalid");
    await call("/auth/forgot-password", { method: "POST", data: { email: "late@example.invalid" } });
    const token = tokenFor("late@example.invalid", "reset");
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 60_000) });
    expect((await call("/auth/reset-password", { method: "POST", data: { token, newPassword: NEW_PASSWORD } })).status).toBe(400);
    expect((await login("late@example.invalid", PASSWORD)).res.status).toBe(200);
  });

  it("ein neuer Reset-Link entwertet den vorherigen", async () => {
    await verifiedUser("two@example.invalid");
    await call("/auth/forgot-password", { method: "POST", data: { email: "two@example.invalid" } });
    const first = tokenFor("two@example.invalid", "reset");
    await call("/auth/forgot-password", { method: "POST", data: { email: "two@example.invalid" } });
    const second = tokenFor("two@example.invalid", "reset");
    expect((await call("/auth/reset-password", { method: "POST", data: { token: first, newPassword: NEW_PASSWORD } })).status).toBe(400);
    expect((await call("/auth/reset-password", { method: "POST", data: { token: second, newPassword: NEW_PASSWORD } })).status).toBe(204);
  });

  it("unbestätigte Konten bekommen statt Reset einen neuen Bestätigungslink; der Reset bestätigt die Adresse zugleich", async () => {
    await register("unverified@example.invalid");
    clearOutbox();
    await call("/auth/forgot-password", { method: "POST", data: { email: "unverified@example.invalid" } });
    expect(outbox[0]!.subject).toMatch(/bestätige/i);
    // Ein Betreiber-Reset-Token für ein unbestätigtes Konto (hier direkt erzeugt) bestätigt zugleich die Adresse.
    const { issueToken } = await import("../../apps/api/src/lib/auth-tokens.ts");
    const token = await issueToken((await dbUser("unverified@example.invalid")).id, "reset_password");
    expect((await call("/auth/reset-password", { method: "POST", data: { token, newPassword: NEW_PASSWORD } })).status).toBe(204);
    expect((await dbUser("unverified@example.invalid")).emailVerifiedAt).not.toBeNull();
  });

  it("ein Einmalpasswort-Konto ist nach dem Reset nicht mehr gesperrt; Reset ist je Adresse und Stunde begrenzt", async () => {
    await verifiedUser("once@example.invalid");
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.email, "once@example.invalid"));
    await call("/auth/forgot-password", { method: "POST", data: { email: "once@example.invalid" } });
    await call("/auth/reset-password", { method: "POST", data: { token: tokenFor("once@example.invalid", "reset"), newPassword: NEW_PASSWORD } });
    expect((await dbUser("once@example.invalid")).mustChangePassword).toBe(false);
    await resetRateLimits();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call("/auth/forgot-password", { method: "POST", data: { email: "once@example.invalid" } })).status);
    expect(statuses.slice(0, 5).every((s) => s === 204)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe("E-Mail-Adresse ändern", () => {
  async function verifiedSession(email: string) {
    const { cookie } = await register(email);
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor(email, "verify") } });
    clearOutbox();
    return cookie;
  }

  it("verlangt das Passwort, schickt den Link an die NEUE Adresse und informiert die alte; erst der Link ändert die Adresse", async () => {
    const cookie = await verifiedSession("old@example.invalid");
    const wrong = await call("/auth/email", { method: "POST", cookie, data: { newEmail: "fresh@example.invalid", password: "wrong-password-123" } });
    expect(wrong.status).toBe(403);
    const ok = await call("/auth/email", { method: "POST", cookie, data: { newEmail: "Fresh@Example.invalid", password: PASSWORD } });
    expect(ok.status).toBe(204);
    expect(outbox.map((m) => m.to).sort()).toEqual(["fresh@example.invalid", "old@example.invalid"]);
    expect(outbox.find((m) => m.to === "old@example.invalid")!.text).not.toContain("#verify="); // Hinweis ohne Link
    expect((await dbUser("old@example.invalid")).email).toBe("old@example.invalid");

    const done = await call("/auth/verify-email", { method: "POST", data: { token: tokenFor("fresh@example.invalid", "verify") } });
    expect(await done.json()).toEqual({ kind: "change_email" });
    const me = await (await call("/auth/me", { cookie })).json() as { email: string; emailVerified: boolean };
    expect(me).toMatchObject({ email: "fresh@example.invalid", emailVerified: true });
    expect((await login("fresh@example.invalid")).res.status).toBe(200);
    expect((await login("old@example.invalid")).res.status).toBe(401);
  });

  it("belegte oder gleiche Adresse wird abgelehnt; ein Reset-Link der alten Adresse gilt nach dem Wechsel nicht mehr", async () => {
    await register("taken@example.invalid");
    const cookie = await verifiedSession("mine@example.invalid");
    expect((await call("/auth/email", { method: "POST", cookie, data: { newEmail: "taken@example.invalid", password: PASSWORD } })).status).toBe(409);
    expect((await call("/auth/email", { method: "POST", cookie, data: { newEmail: "mine@example.invalid", password: PASSWORD } })).status).toBe(400);

    await call("/auth/forgot-password", { method: "POST", data: { email: "mine@example.invalid" } });
    const reset = tokenFor("mine@example.invalid", "reset");
    await call("/auth/email", { method: "POST", cookie, data: { newEmail: "moved@example.invalid", password: PASSWORD } });
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor("moved@example.invalid", "verify") } });
    expect((await call("/auth/reset-password", { method: "POST", data: { token: reset, newPassword: NEW_PASSWORD } })).status).toBe(400);
  });

  it("wird die Adresse zwischenzeitlich anderweitig vergeben, scheitert die Bestätigung mit 409", async () => {
    const cookie = await verifiedSession("race@example.invalid");
    await call("/auth/email", { method: "POST", cookie, data: { newEmail: "contested@example.invalid", password: PASSWORD } });
    const token = tokenFor("contested@example.invalid", "verify");
    await db.insert(users).values({ email: "contested@example.invalid", name: "Andere", handle: "someone_else", passwordHash: await hashPassword(PASSWORD) });
    expect((await call("/auth/verify-email", { method: "POST", data: { token } })).status).toBe(409);
    expect((await dbUser("race@example.invalid")).email).toBe("race@example.invalid");
  });

  it("auch ein gesperrtes, unbestätigtes Konto kann einen Tippfehler korrigieren", async () => {
    const { cookie } = await register("typo@example.invalid");
    clearOutbox();
    expect((await call("/auth/email", { method: "POST", cookie, data: { newEmail: "right@example.invalid", password: PASSWORD } })).status).toBe(204);
    expect(outbox.map((m) => m.to)).not.toContain("typo@example.invalid"); // unbestätigt: kein Hinweis an die alte Adresse
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor("right@example.invalid", "verify") } });
    expect((await call("/notifications", { cookie })).status).toBe(200);
  });
});

describe("Bestandskonten und Migration", () => {
  it("die Migration markiert vorhandene Konten als bestätigt, aber nur beim Anlegen der Spalte", async () => {
    await db.execute(sql`ALTER TABLE users DROP COLUMN email_verified_at`);
    await db.execute(sql`INSERT INTO users (email, name, handle, password_hash) VALUES ('legacy@example.invalid', 'Alt', 'legacy_user', 'x')`);
    const file = (await import("node:fs")).readFileSync(fileURLToPath(new URL("../../apps/api/drizzle/0023_email_auth.sql", import.meta.url)), "utf8");
    await db.execute(sql.raw(file));
    expect((await dbUser("legacy@example.invalid")).emailVerifiedAt).not.toBeNull();
    // erneut einspielen: ein neues, unbestätigtes Konto bleibt unbestätigt
    await db.execute(sql`INSERT INTO users (email, name, handle, password_hash) VALUES ('later@example.invalid', 'Neu', 'later_user', 'x')`);
    await db.execute(sql.raw(file));
    expect((await dbUser("later@example.invalid")).emailVerifiedAt).toBeNull();
  });

  it("Sitzungen anderer Konten bleiben vom Reset unberührt", async () => {
    await register("a1@example.invalid");
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor("a1@example.invalid", "verify") } });
    await register("b1@example.invalid");
    await call("/auth/verify-email", { method: "POST", data: { token: tokenFor("b1@example.invalid", "verify") } });
    const bCookie = (await login("b1@example.invalid")).cookie;
    await call("/auth/forgot-password", { method: "POST", data: { email: "a1@example.invalid" } });
    await call("/auth/reset-password", { method: "POST", data: { token: tokenFor("a1@example.invalid", "reset"), newPassword: NEW_PASSWORD } });
    expect((await call("/auth/me", { cookie: bCookie })).status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, (await dbUser("a1@example.invalid")).id))).toHaveLength(0);
  });
});
