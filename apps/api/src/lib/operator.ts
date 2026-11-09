import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";
import { hashPassword } from "./password.ts";
import { recordSecurityEvent } from "./session.ts";

/** Fehler mit einer Meldung, die dem Betreiber direkt angezeigt werden darf. */
export class OperatorError extends Error {}

export type ProvisionResult =
  | { action: "created"; email: string; password: string }
  | { action: "reset"; email: string; password: string }
  | { action: "promoted"; email: string }
  | { action: "unchanged"; email: string };

const emailSchema = z.string().trim().email().max(254).transform((v) => v.toLowerCase());
export const CLI_DEVICE = "Betreiber-CLI";

/** Einmalpasswort: 24 Zeichen aus 144 Bit Zufall (base64url). Wird nur ausgegeben, nie gespeichert oder protokolliert. */
export const generatePassword = () => randomBytes(18).toString("base64url");

/**
 * Betreiber (`platform_admin`) bereitstellen – ohne Demo-Daten, nur durch bewussten Aufruf (CLI), nie automatisch.
 * - Neues Konto: Zufallspasswort wird zurückgegeben (einmalig anzeigen); der Passwortwechsel ist ERZWUNGEN (`mustChangePassword`).
 * - `resetPassword` (nur für bestehende Betreiber, z. B. ausgesperrt): neues Einmalpasswort, Wechsel erzwungen, alle Sitzungen enden.
 * - Bestehendes Konto: nur mit `promote`; das Passwort bleibt, ALLE Sitzungen des Kontos werden beendet,
 *   das Ereignis `role_changed` landet im Anmeldeprotokoll.
 */
export async function provisionOperator(input: { email: string; name?: string; promote?: boolean; resetPassword?: boolean }): Promise<ProvisionResult> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) throw new OperatorError("Ungültige E-Mail-Adresse.");
  const email = parsed.data;
  const name = (input.name ?? "Betreiber").trim().slice(0, 60) || "Betreiber";

  return db.transaction(async (tx): Promise<ProvisionResult> => {
    const existing = await tx.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      if (input.resetPassword) {
        if (existing.role !== "platform_admin") {
          throw new OperatorError(`${email} ist kein Betreiber. --reset-password gilt nur für Betreiber-Konten (zuerst mit --promote befördern).`);
        }
        const password = generatePassword();
        await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, existing.id));
        await tx.delete(sessions).where(eq(sessions.userId, existing.id));
        return { action: "reset", email, password };
      }
      if (existing.role === "platform_admin") return { action: "unchanged", email };
      if (!input.promote) {
        throw new OperatorError(`Für ${email} existiert bereits ein Konto. Zum Befördern bewusst mit --promote bestätigen.`);
      }
      await tx.update(users).set({ role: "platform_admin" }).where(eq(users.id, existing.id));
      await tx.delete(sessions).where(eq(sessions.userId, existing.id));
      return { action: "promoted", email };
    }
    if (input.resetPassword) throw new OperatorError(`Für ${email} existiert kein Konto. --reset-password gilt nur für vorhandene Betreiber.`);
    const password = generatePassword();
    const [created] = await tx.insert(users).values({
      email, name, handle: `operator_${randomBytes(4).toString("hex")}`, passwordHash: await hashPassword(password), role: "platform_admin",
      mustChangePassword: true,
      emailVerifiedAt: new Date(), // vom Betreiber selbst angelegt: Adresse gilt als bestätigt
    }).onConflictDoNothing().returning({ id: users.id });
    if (!created) throw new OperatorError("Konto konnte nicht angelegt werden (Konflikt). Bitte erneut versuchen.");
    return { action: "created", email, password };
  }).then(async (result) => {
    if (result.action !== "unchanged") {
      const user = await db.query.users.findFirst({ where: eq(users.email, result.email), columns: { id: true } });
      if (user) await recordSecurityEvent(user.id, result.action === "reset" ? "password_changed" : "role_changed", CLI_DEVICE);
    }
    return result;
  });
}
