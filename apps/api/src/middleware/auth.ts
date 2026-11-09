import { createMiddleware } from "hono/factory";
import { users } from "../db/schema.ts";
import { authenticate } from "../lib/session.ts";
import { emailVerificationRequired } from "../lib/mailer.ts";

export type AuthEnv = { Variables: { userId: string; role: typeof users.$inferSelect.role; sessionId: string } };

/** Fehlercode, an dem der Client „Passwortwechsel erforderlich“ erkennt (403, nicht 401: die Sitzung ist gültig). */
export const PASSWORD_CHANGE_REQUIRED = "password_change_required";
/** Fehlercode „E-Mail-Adresse noch nicht bestätigt“ (B-87, nur wenn E-Mail-Versand konfiguriert ist). */
export const EMAIL_UNVERIFIED = "email_unverified";

function authMiddleware(allowPasswordChangePending: boolean) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await authenticate(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    // B-58: Konten mit Einmalpasswort dürfen nur das Passwort ändern, sich ansehen (/auth/me) und abmelden.
    if (session.mustChangePassword && !allowPasswordChangePending) {
      return c.json({ error: "Bitte zuerst ein neues Passwort festlegen.", code: PASSWORD_CHANGE_REQUIRED }, 403);
    }
    // B-87: ohne bestätigte Adresse nur /auth/me, Erneut-senden, Adresse ändern, Passwort und Abmelden.
    if (!session.emailVerified && emailVerificationRequired() && !allowPasswordChangePending) {
      return c.json({ error: "Bitte zuerst die E-Mail-Adresse bestätigen.", code: EMAIL_UNVERIFIED }, 403);
    }
    c.set("userId", session.userId);
    c.set("role", session.role);
    c.set("sessionId", session.sessionId);
    // DB/handler failures are not authentication failures.
    await next();
  });
}

/** Verlangt eine gültige Sitzung (HttpOnly-Cookie) und legt userId/role/sessionId im Context ab. Sperrt Konten mit offenem Passwortwechsel. */
export const requireAuth = authMiddleware(false);
/** Wie `requireAuth`, lässt aber auch Konten mit offenem Passwortwechsel durch (nur für /auth/me, /auth/password, /auth/logout-all). */
export const requireAuthAllowPending = authMiddleware(true);

/** Nur Plattform-Admins (Dev-Admin/Backend). */
export const requirePlatformAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("role") !== "platform_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

/**
 * Optionale Anmeldung: setzt `userId`, wenn eine gültige Sitzung vorliegt, sonst anonym weiter.
 * Für öffentliche Listen, die für angemeldete Nutzer Zusatzinfos liefern (z. B. eigener Vote).
 */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await authenticate(c).catch(() => null);
  // Konten mit offenem Passwortwechsel gelten auch auf öffentlichen Routen als anonym.
  if (session && !session.mustChangePassword && (session.emailVerified || !emailVerificationRequired())) {
    c.set("userId", session.userId);
    c.set("role", session.role);
    c.set("sessionId", session.sessionId);
  }
  await next();
});
