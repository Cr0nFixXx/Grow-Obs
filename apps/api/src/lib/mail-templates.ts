import type { MailMessage } from "./mailer.ts";
import { appUrl } from "./mailer.ts";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const link = (kind: "verify" | "reset", token: string) => `${appUrl()}/#${kind}=${token}`;

function layout(name: string, lines: string[], url: string | null, action: string, footer: string): Pick<MailMessage, "text" | "html"> {
  const text = [`Hallo ${name},`, "", ...lines, ...(url ? ["", `${action}: ${url}`] : []), "", footer, "", "Grow|Obs"].join("\n");
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b2a1d">`
    + `<p>Hallo ${escapeHtml(name)},</p>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`
    + (url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#3f8f3a;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">${escapeHtml(action)}</a></p><p style="font-size:12px;color:#5a6b5c;word-break:break-all">Funktioniert der Knopf nicht? Kopiere diesen Link in den Browser:<br>${escapeHtml(url)}</p>` : "")
    + `<p style="font-size:12px;color:#5a6b5c">${escapeHtml(footer)}</p><p style="font-size:12px;color:#5a6b5c">Grow|Obs</p></div>`;
  return { text, html };
}

export function verifyEmailMail(to: string, name: string, token: string): MailMessage {
  return {
    to, subject: "Bitte bestätige deine E-Mail-Adresse",
    ...layout(name, ["bitte bestätige deine E-Mail-Adresse, damit du Grow|Obs nutzen kannst. Der Link gilt 24 Stunden und nur einmal."], link("verify", token), "Adresse bestätigen",
      "Du hast dich nicht angemeldet? Dann ignoriere diese Nachricht, es passiert nichts."),
  };
}

export function changeEmailMail(to: string, name: string, token: string): MailMessage {
  return {
    to, subject: "Bestätige deine neue E-Mail-Adresse",
    ...layout(name, ["du möchtest diese Adresse für dein Konto verwenden. Bestätige sie mit dem Link, er gilt 24 Stunden und nur einmal."], link("verify", token), "Neue Adresse bestätigen",
      "Das warst nicht du? Dann ignoriere diese Nachricht, deine bisherige Adresse bleibt unverändert."),
  };
}

export function emailChangeNoticeMail(to: string, name: string, newEmail: string): MailMessage {
  return {
    to, subject: "Für dein Konto wurde eine neue E-Mail-Adresse angefragt",
    ...layout(name, [`für dein Konto wurde die Adresse ${newEmail} angefragt. Sie wird erst aktiv, wenn sie dort bestätigt wird.`, "Warst du das nicht, ändere bitte sofort dein Passwort."], null, "",
      "Diese Nachricht geht an deine bisherige Adresse."),
  };
}

export function resetPasswordMail(to: string, name: string, token: string): MailMessage {
  return {
    to, subject: "Passwort zurücksetzen",
    ...layout(name, ["du hast ein neues Passwort angefordert. Der Link gilt 1 Stunde und nur einmal; danach musst du dich überall neu anmelden."], link("reset", token), "Neues Passwort festlegen",
      "Das warst nicht du? Dann ignoriere diese Nachricht, dein Passwort bleibt unverändert."),
  };
}
