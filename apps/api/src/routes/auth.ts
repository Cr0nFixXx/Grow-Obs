import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { grows, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";

export const auth = new Hono<AuthEnv>();

/** Mappt eine User-Row auf den Frontend-`User`-Shape (inkl. aggregierter Counts). */
async function toUser(id: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) return null;
  const [g] = await db.select({ n: count() }).from(grows).where(eq(grows.userId, id));
  const [h] = await db
    .select({ n: count() })
    .from(grows)
    .where(and(eq(grows.userId, id), eq(grows.phase, "Ernte")));
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    avatar: u.avatarUrl ?? "",
    level: u.level,
    title: u.title,
    role: u.role,
    telegram: u.telegram,
    grows: g?.n ?? 0,
    harvests: h?.n ?? 0,
    followers: 0,
  };
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  handle: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).transform((value) => value.toLowerCase()).optional(),
});

auth.post("/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, email, password, handle } = body.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "E-Mail bereits registriert" }, 409);

  const slug = handle ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) || "grower"}_${randomBytes(4).toString("hex")}`;
  const [u] = await db
    .insert(users)
    .values({ email, name, handle: slug, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning();
  if (!u) return c.json({ error: "E-Mail oder Handle bereits vergeben" }, 409);

  const token = await signToken({ sub: u.id, role: u.role });
  return c.json({ token, user: await toUser(u.id) }, 201);
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

auth.post("/login", async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const u = await db.query.users.findFirst({ where: eq(users.email, body.data.email) });
  if (!u || !(await verifyPassword(body.data.password, u.passwordHash))) {
    return c.json({ error: "Anmeldedaten ungültig" }, 401);
  }
  const token = await signToken({ sub: u.id, role: u.role });
  return c.json({ token, user: await toUser(u.id) });
});

auth.get("/me", requireAuth, async (c) => {
  const u = await toUser(c.get("userId"));
  if (!u) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(u);
});
