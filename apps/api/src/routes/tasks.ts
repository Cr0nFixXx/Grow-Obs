import { Hono } from "hono";
import { and, desc, eq, not } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { tasks } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";

/** Persönliche Tasks. Jede Abfrage ist auf den angemeldeten User beschränkt (kein Fremdzugriff). */
export const tasksApi = new Hono<AuthEnv>();
tasksApi.use("*", requireAuth);

function toTask(t: typeof tasks.$inferSelect) {
  return { id: t.id, title: t.title, grow: t.grow, when: t.dueLabel, prio: t.prio, done: t.done };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(140),
  grow: z.string().trim().max(120).default("Allgemein"),
  when: z.string().trim().min(1).max(40),
  prio: z.enum(["hoch", "mittel", "niedrig"]),
}).strict();

tasksApi.get("/", async (c) => {
  const rows = await db.select().from(tasks).where(eq(tasks.userId, c.get("userId"))).orderBy(desc(tasks.createdAt)).limit(200);
  return c.json(rows.map(toTask));
});

tasksApi.post("/", async (c) => {
  const body = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const [row] = await db.insert(tasks).values({
    userId: c.get("userId"), title: body.data.title, grow: body.data.grow || "Allgemein", dueLabel: body.data.when, prio: body.data.prio,
  }).returning();
  return c.json(toTask(row), 201);
});

/** Atomar umschalten; fremde oder unbekannte IDs → 404 (keine Existenz-Leaks). */
tasksApi.post("/:id/toggle", async (c) => {
  const id = uuid(c.req.param("id"));
  const [row] = await db.update(tasks).set({ done: not(tasks.done) })
    .where(and(eq(tasks.id, id), eq(tasks.userId, c.get("userId")))).returning();
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(toTask(row));
});
