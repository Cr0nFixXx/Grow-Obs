import { db } from "../db/client.ts";
import { notifications } from "../db/schema.ts";
import { publish } from "../realtime/hub.ts";

/** Legt eine Benachrichtigung an und meldet sie live an die Geräte des Empfängers. */
export async function createNotification(userId: string, input: { type: typeof notifications.$inferInsert.type; title: string; body?: string }): Promise<void> {
  const [row] = await db.insert(notifications).values({ userId, type: input.type, title: input.title.slice(0, 200), body: (input.body ?? "").slice(0, 500) }).returning({ id: notifications.id });
  await publish({ users: [userId] }, { type: "notification", id: row!.id });
}
