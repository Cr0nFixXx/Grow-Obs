import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { ago } from "../lib/time";

export const notificationsApi = new Hono<AuthEnv>();

notificationsApi.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
  return c.json(
    rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, read: n.read, time: ago(n.createdAt) }))
  );
});

notificationsApi.post("/:id/read", requireAuth, async (c) => {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, c.req.param("id")), eq(notifications.userId, c.get("userId"))));
  return c.json({ ok: true });
});

notificationsApi.post("/read-all", requireAuth, async (c) => {
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, c.get("userId")));
  return c.json({ ok: true });
});
