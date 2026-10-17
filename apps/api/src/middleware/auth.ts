import { createMiddleware } from "hono/factory";
import { users } from "../db/schema.ts";
import { authenticate } from "../lib/session.ts";

export type AuthEnv = { Variables: { userId: string; role: typeof users.$inferSelect.role; sessionId: string } };

/** Verlangt eine gültige Sitzung (HttpOnly-Cookie) und legt userId/role/sessionId im Context ab. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await authenticate(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.userId);
  c.set("role", session.role);
  c.set("sessionId", session.sessionId);
  // DB/handler failures are not authentication failures.
  await next();
});

/** Nur Plattform-Admins (Dev-Admin/Backend). */
export const requirePlatformAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("role") !== "platform_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

/**
 * Optionale Anmeldung: setzt `userId`, wenn eine gültige Sitzung vorliegt, sonst anonym weiter.
 * Für öffentliche Listen, die für angemeldete Nutzer Zusatzinfos liefern (z. B. eigener Vote).
 */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await authenticate(c).catch(() => null);
  if (session) {
    c.set("userId", session.userId);
    c.set("role", session.role);
    c.set("sessionId", session.sessionId);
  }
  await next();
});
