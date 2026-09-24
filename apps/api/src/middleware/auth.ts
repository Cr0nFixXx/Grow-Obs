import { createMiddleware } from "hono/factory";
import { verifyToken } from "../lib/jwt";

export type AuthEnv = { Variables: { userId: string; role: string } };

/** Prüft den Bearer-JWT und legt userId/role im Context ab. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verifyToken(header.slice(7));
    c.set("userId", payload.sub);
    c.set("role", payload.role);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

/** Nur Plattform-Admins (Dev-Admin/Backend). */
export const requirePlatformAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("role") !== "platform_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
