import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { verifyToken } from "../lib/jwt.ts";

export type AuthEnv = { Variables: { userId: string; role: typeof users.$inferSelect.role } };

/** Prüft den Bearer-JWT und legt userId/role im Context ab. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let userId: string;
  try {
    userId = (await verifyToken(header.slice(7))).sub;
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // Reload the role: a still-valid JWT must not retain revoked admin permissions.
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", user.id);
  c.set("role", user.role);
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
 * Optionale Anmeldung: setzt `userId`, wenn ein gültiger Bearer vorliegt, sonst anonym weiter.
 * Für öffentliche Listen, die für angemeldete Nutzer Zusatzinfos liefern (z. B. eigener Vote).
 */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      const userId = (await verifyToken(header.slice(7))).sub;
      const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      if (user) { c.set("userId", user.id); c.set("role", user.role); }
    } catch { /* ungültiges Token → anonym */ }
  }
  await next();
});
