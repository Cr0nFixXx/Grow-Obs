import { Hono } from "hono";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { grows, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { requireAuth, type AuthEnv } from "../middleware/auth";

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
    telegram: u.telegram,
    grows: g?.n ?? 0,
    harvests: h?.n ?? 0,
    followers: 0,
  };
}

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  handle: z.string().optional(),
});

auth.post("/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, email, password, handle } = body.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "E-Mail bereits registriert" }, 409);

  const slug = handle ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const [u] = await db
    .insert(users)
    .values({ email, name, handle: slug, passwordHash: await hashPassword(password) })
    .returning();

  const token = await signToken({ sub: u.id, role: u.role });
  return c.json({ token, user: await toUser(u.id) }, 201);
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

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
