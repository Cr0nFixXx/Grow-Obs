import { db } from "../db/client.ts";
import { notifications } from "../db/schema.ts";
import { publish } from "../realtime/hub.ts";
import { categoryOfNotification, targetPath, type PushCategory } from "./push-core.ts";
import { pushInBackground } from "./push.ts";

/** Legt eine Benachrichtigung an und meldet sie live an die Geräte des Empfängers. */
export async function createNotification(userId: string, input: { type: typeof notifications.$inferInsert.type; title: string; body?: string; /** Push-Kategorie überschreiben (z. B. Gruppeneinladung → `messages`) */ category?: PushCategory; url?: string }): Promise<void> {
  const [row] = await db.insert(notifications).values({ userId, type: input.type, title: input.title.slice(0, 200), body: (input.body ?? "").slice(0, 500) }).returning({ id: notifications.id });
  await publish({ users: [userId] }, { type: "notification", id: row!.id });
  // Web-Push (B-63) ist ein Zusatz: Kategorie/Ruhezeit/Online-Prüfung und Fehlerbehandlung liegen in `sendPushToUser`.
  void pushInBackground(userId, { category: input.category ?? categoryOfNotification(input.type ?? "system"), title: input.title, body: input.body, url: input.url ?? targetPath(input.type ?? "system") });
}
