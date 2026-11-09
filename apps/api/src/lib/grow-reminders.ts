import { and, eq, inArray, isNotNull, isNull, lte, max, or, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { growEnv, growLogs, grows, users } from "../db/schema.ts";
import { createNotification } from "./notify.ts";
import { dayDiff, todayIso } from "./grow-state.ts";

const MAX_LINES = 5;

export interface ReminderLine { name: string; kind: "env" | "log"; days: number }

/** „Cherry Run: seit 3 Tagen keine Messwerte“ – eine Zeile je Grow und Art, gekürzt auf wenige Zeilen. */
export function reminderBody(lines: ReminderLine[]): string {
  const text = lines.slice(0, MAX_LINES).map((l) => `${l.name}: seit ${l.days} ${l.days === 1 ? "Tag" : "Tagen"} ${l.kind === "env" ? "keine Messwerte" : "kein Log-Eintrag"}`);
  if (lines.length > MAX_LINES) text.push(`… und ${lines.length - MAX_LINES} weitere`);
  return text.join("\n");
}

/**
 * Erinnerungen (B-88, nur In-App + ggf. Push): Konten mit eingestellter Frist (1–5 Tage) bekommen eine gebündelte Meldung,
 * wenn bei einem laufenden, nicht archivierten Grow so lange kein Messwert bzw. Log-Eintrag steht.
 * Je Lücke wird nur einmal erinnert: Der Tag der Erinnerung wird atomar am Grow vermerkt und erst nach einem neuen Eintrag wieder frei.
 * Ausgangspunkt ohne Eintrag ist das Startdatum.
 */
export async function runGrowReminders(now = new Date()): Promise<{ candidates: number; notified: number; lines: number }> {
  const today = todayIso(now);
  const people = await db.select({ id: users.id, days: users.growReminderDays }).from(users).where(isNotNull(users.growReminderDays));
  let notified = 0;
  let total = 0;
  for (const person of people) {
    const limit = person.days ?? 0;
    if (limit < 1) continue;
    const rows = await db.select().from(grows).where(and(eq(grows.userId, person.id), eq(grows.status, "active"), isNull(grows.archivedAt)));
    if (rows.length === 0) continue;
    const ids = rows.map((r) => r.id);
    const envLast = new Map((await db.select({ id: growEnv.growId, last: max(growEnv.loggedOn) }).from(growEnv).where(inArray(growEnv.growId, ids)).groupBy(growEnv.growId)).map((r) => [r.id, r.last]));
    const logLast = new Map((await db.select({ id: growLogs.growId, last: max(growLogs.loggedOn) }).from(growLogs).where(inArray(growLogs.growId, ids)).groupBy(growLogs.growId)).map((r) => [r.id, r.last]));
    const lines: ReminderLine[] = [];
    for (const row of rows) {
      for (const kind of ["env", "log"] as const) {
        const reference = (kind === "env" ? envLast : logLast).get(row.id) ?? row.startDate;
        const gap = dayDiff(reference, today);
        if (gap < limit) continue;
        // Atomar reservieren: nur wenn für diese Lücke noch nicht erinnert wurde (Vermerk nicht neuer als der letzte Eintrag oder leer).
        const column = kind === "env" ? grows.remindedEnvOn : grows.remindedLogOn;
        const claimed = await db.update(grows).set(kind === "env" ? { remindedEnvOn: today } : { remindedLogOn: today })
          .where(and(eq(grows.id, row.id), or(isNull(column), lte(column, sql`${reference}::date`)))).returning({ id: grows.id });
        if (claimed.length) lines.push({ name: row.name, kind, days: gap });
      }
    }
    if (lines.length === 0) continue;
    total += lines.length;
    try {
      await createNotification(person.id, { type: "grow", title: lines.length === 1 ? "Erinnerung an deinen Grow" : "Erinnerung an deine Grows", body: reminderBody(lines), url: "/grows" });
      notified += 1;
    } catch (error) {
      console.error(JSON.stringify({ event: "grow_reminder_failed", type: error instanceof Error ? error.name : "unknown" }));
    }
  }
  return { candidates: people.length, notified, lines: total };
}
