import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { follows, grows, loginEvents, sessions, users } from "../db/schema.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { clearSessionCookie, deviceLabel, LOGIN_LOG_RETENTION_DAYS, recordLoginEvent, sessionIdFromCookie, startSession } from "../lib/session.ts";
import { requireAuth, requireAuthAllowPending, type AuthEnv } from "../middleware/auth.ts";
import { emailKey, rateLimit, userKey } from "../middleware/rate-limit.ts";
import { imageRef } from "../lib/media-ref.ts";
import { BIO_MAX, GROW_SINCE_MIN, HANDLE_COOLDOWN_DAYS, HANDLE_PATTERN, INTERESTS, INTERESTS_MAX, LOCATION_MAX, MEDIA, VISIBILITIES } from "../lib/profile-fields.ts";

export const auth = new Hono<AuthEnv>();

/** Mappt eine User-Row auf den Frontend-`User`-Shape (inkl. aggregierter Counts). */
async function toUser(id: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) return null;
  const [[g], [h], [followers], [following], [requests]] = await Promise.all([
    db.select({ n: count() }).from(grows).where(eq(grows.userId, id)),
    db.select({ n: count() }).from(grows).where(and(eq(grows.userId, id), eq(grows.phase, "Ernte"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followeeId, id), eq(follows.status, "accepted"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followerId, id), eq(follows.status, "accepted"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followeeId, id), eq(follows.status, "pending"))),
  ]);
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    avatar: u.avatarUrl ?? "",
    cover: u.coverUrl ?? "",
    level: u.level,
    title: u.title,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    telegram: u.telegram,
    weeklyReport: u.weeklyReport,
    bio: u.bio,
    location: u.location,
    growSince: u.growSince ?? null,
    medium: u.medium ?? null,
    interests: u.interests,
    profileVisibility: u.profileVisibility as (typeof VISIBILITIES)[number],
    handleChangedAt: u.handleChangedAt ? u.handleChangedAt.toISOString() : null,
    grows: g?.n ?? 0,
    harvests: h?.n ?? 0,
    followers: followers?.n ?? 0,
    following: following?.n ?? 0,
    followRequests: requests?.n ?? 0,
  };
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  handle: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).transform((value) => value.toLowerCase()).optional(),
  remember: z.boolean().optional(),
});

/** Brute-Force-/Spam-Schutz: Limits pro IP und (Login) pro E-Mail-Adresse. */
const registerLimit = rateLimit({ name: "register", limit: 10, windowMs: 60 * 60 * 1000 });
const loginLimit = rateLimit({ name: "login", limit: 10, windowMs: 15 * 60 * 1000, keys: emailKey });

auth.post("/register", registerLimit, async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, email, password, handle, remember } = body.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "E-Mail bereits registriert" }, 409);

  const slug = handle ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) || "grower"}_${randomBytes(4).toString("hex")}`;
  const [u] = await db
    .insert(users)
    .values({ email, name, handle: slug, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning();
  if (!u) return c.json({ error: "E-Mail oder Handle bereits vergeben" }, 409);

  const { token } = await startSession(c, u, remember ?? true);
  await recordLoginEvent(c, u.id, "register");
  return c.json({ user: await toUser(u.id), ...(token ? { token } : {}) }, 201);
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  /** true (Standard): dauerhafte Sitzung bis JWT_TTL; false: Session-Cookie, höchstens 12 h. */
  remember: z.boolean().optional(),
});

auth.post("/login", loginLimit, async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const u = await db.query.users.findFirst({ where: eq(users.email, body.data.email) });
  if (!u || !(await verifyPassword(body.data.password, u.passwordHash))) {
    if (u) await recordLoginEvent(c, u.id, "login_failed"); // unbekannte E-Mails werden nicht gespeichert
    return c.json({ error: "Anmeldedaten ungültig" }, 401);
  }
  const { token } = await startSession(c, u, body.data.remember ?? true);
  await recordLoginEvent(c, u.id, "login");
  return c.json({ user: await toUser(u.id), ...(token ? { token } : {}) });
});

const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  title: z.string().trim().min(1).max(40).optional(),
  avatar: z.union([imageRef, z.literal("")]).optional(),
  cover: z.union([imageRef, z.literal("")]).optional(),
  weeklyReport: z.boolean().optional(),
  bio: z.string().trim().max(BIO_MAX, `Bio: höchstens ${BIO_MAX} Zeichen`).optional(),
  location: z.string().trim().max(LOCATION_MAX, `Ort: höchstens ${LOCATION_MAX} Zeichen`).optional(),
  growSince: z.number().int().min(GROW_SINCE_MIN, "Jahr unplausibel").max(new Date().getFullYear(), "Jahr liegt in der Zukunft").nullable().optional(),
  medium: z.enum(MEDIA).nullable().optional(),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS_MAX, `Höchstens ${INTERESTS_MAX} Interessen`).optional(),
  profileVisibility: z.enum(VISIBILITIES).optional(),
  handle: z.string().trim().regex(HANDLE_PATTERN, "Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen und _").transform((value) => value.toLowerCase()).optional(),
}).strict();

/** Eigenes Profil ändern (Name, Titel, Avatar, Profilfelder, Sichtbarkeit, Benutzername, Wochenreport). Rolle/E-Mail sind hier bewusst nicht änderbar. */
auth.patch("/me", requireAuth, async (c) => {
  const body = updateMeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, title, avatar, cover, weeklyReport, bio, location, growSince, medium, interests, profileVisibility, handle } = body.data;
  const userId = c.get("userId");
  const set: Partial<typeof users.$inferInsert> = {
    ...(name !== undefined ? { name } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(avatar !== undefined ? { avatarUrl: avatar || null } : {}),
    ...(cover !== undefined ? { coverUrl: cover || null } : {}),
    ...(weeklyReport !== undefined ? { weeklyReport } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(growSince !== undefined ? { growSince } : {}),
    ...(medium !== undefined ? { medium } : {}),
    ...(interests !== undefined ? { interests: [...new Set(interests)] } : {}),
    ...(profileVisibility !== undefined ? { profileVisibility } : {}),
  };
  if (handle !== undefined) {
    const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { handle: true, handleChangedAt: true } });
    if (current && current.handle !== handle) {
      const next = current.handleChangedAt ? current.handleChangedAt.getTime() + HANDLE_COOLDOWN_DAYS * 86_400_000 : 0;
      if (next > Date.now()) {
        return c.json({ error: `Der Benutzername kann nur alle ${HANDLE_COOLDOWN_DAYS} Tage geändert werden (wieder möglich ab ${new Date(next).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}).` }, 400);
      }
      set.handle = handle;
      set.handleChangedAt = new Date();
    }
  }
  if (Object.keys(set).length > 0) {
    try {
      await db.update(users).set(set).where(eq(users.id, userId));
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
      if (code === "23505") return c.json({ error: "Dieser Benutzername ist bereits vergeben." }, 409);
      throw error;
    }
  }
  // Sichtbarkeit anpassen: „alle“ nimmt offene Anfragen an, „niemand“ verwirft sie.
  if (profileVisibility === "all") await db.update(follows).set({ status: "accepted" }).where(and(eq(follows.followeeId, userId), eq(follows.status, "pending")));
  if (profileVisibility === "nobody") await db.delete(follows).where(and(eq(follows.followeeId, userId), eq(follows.status, "pending")));
  return c.json(await toUser(userId));
});

auth.get("/me", requireAuthAllowPending, async (c) => {
  const u = await toUser(c.get("userId"));
  if (!u) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(u);
});

/** Abmelden: Sitzung serverseitig löschen und Cookie entfernen. Idempotent (auch ohne/mit ungültiger Sitzung → 204). */
auth.post("/logout", async (c) => {
  const sid = await sessionIdFromCookie(c);
  if (sid) await db.delete(sessions).where(eq(sessions.id, sid));
  clearSessionCookie(c);
  return c.body(null, 204);
});

/** „Alle Geräte abmelden“: beendet jede Sitzung des Nutzers, auch die aktuelle. */
auth.post("/logout-all", requireAuthAllowPending, async (c) => {
  await db.delete(sessions).where(eq(sessions.userId, c.get("userId")));
  clearSessionCookie(c);
  return c.body(null, 204);
});

/** Aktive Sitzungen des Nutzers (ohne rohen User-Agent, ohne IP). */
auth.get("/sessions", requireAuth, async (c) => {
  const rows = await db.select().from(sessions)
    .where(and(eq(sessions.userId, c.get("userId")), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  return c.json(rows.map((row) => ({
    id: row.id,
    device: deviceLabel(row.userAgent),
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    current: row.id === c.get("sessionId"),
  })));
});

/** Eine eigene Sitzung beenden (z. B. verlorenes Gerät). Fremde IDs → 404. */
auth.delete("/sessions/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) return c.json({ error: "Nicht gefunden" }, 404);
  const deleted = await db.delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, c.get("userId"))))
    .returning({ id: sessions.id });
  if (!deleted.length) return c.json({ error: "Nicht gefunden" }, 404);
  if (id === c.get("sessionId")) clearSessionCookie(c);
  return c.body(null, 204);
});

const passwordLimit = rateLimit({ name: "password", limit: 5, windowMs: 15 * 60 * 1000, keys: userKey });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12, "Mindestens 12 Zeichen").max(128),
});

/**
 * Passwort ändern: verlangt das aktuelle Passwort, beendet alle ANDEREN Sitzungen (diese bleibt angemeldet)
 * und protokolliert das Ereignis. Falsches Passwort → 403 (nicht 401, das wäre „Sitzung abgelaufen“).
 */
auth.post("/password", requireAuthAllowPending, passwordLimit, async (c) => {
  const body = changePasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { currentPassword, newPassword } = body.data;
  if (currentPassword === newPassword) return c.json({ error: "Das neue Passwort muss sich vom aktuellen unterscheiden" }, 400);
  const userId = c.get("userId");
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || !(await verifyPassword(currentPassword, u.passwordHash))) {
    await recordLoginEvent(c, userId, "login_failed");
    return c.json({ error: "Aktuelles Passwort ist falsch" }, 403);
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false }).where(eq(users.id, userId));
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, c.get("sessionId"))));
  await recordLoginEvent(c, userId, "password_changed");
  return c.body(null, 204);
});

/** Anmeldeprotokoll des Nutzers (Zeit, Ereignis, Gerät; kein IP), letzte 90 Tage, neueste zuerst. */
auth.get("/login-history", requireAuth, async (c) => {
  const since = new Date(Date.now() - LOGIN_LOG_RETENTION_DAYS * 86_400_000);
  const rows = await db.select().from(loginEvents)
    .where(and(eq(loginEvents.userId, c.get("userId")), gt(loginEvents.createdAt, since)))
    .orderBy(desc(loginEvents.createdAt)).limit(50);
  return c.json(rows.map((row) => ({ id: row.id, event: row.event, device: row.device, createdAt: row.createdAt.toISOString() })));
});
