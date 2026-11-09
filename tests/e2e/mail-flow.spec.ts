import { expect, test } from "@playwright/test";
import { PASSWORD, openAuth, uniqueEmail } from "./helpers";

/**
 * B-87 im Browser, gegen einen zweiten Server MIT Mailversand (Projekt „mail“, siehe playwright.config.ts): echter
 * SMTP-Transport zu einem lokalen Test-Mailserver. Alle anderen Specs laufen ohne Mailversand (keine Bestätigungspflicht).
 */
const SINK = "http://127.0.0.1:2526/mails";
const NEW_PASSWORD = "e2e-brand-new-password-42";

async function linkFor(email: string, kind: "verify" | "reset"): Promise<string> {
  let link = "";
  await expect.poll(async () => {
    const mails = (await (await fetch(SINK)).json()) as { to: string[]; body: string }[];
    const mail = [...mails].reverse().find((m) => m.to.includes(email) && new RegExp(`#${kind}=`).test(m.body));
    link = mail ? (new RegExp(`(https?://[^\\s"'<>]*#${kind}=[A-Za-z0-9_-]+)`).exec(mail.body)?.[1] ?? "") : "";
    return link;
  }, { message: `Mail mit ${kind}-Link an ${email}`, timeout: 15_000 }).not.toBe("");
  // Der Link zeigt auf die konfigurierte APP_URL; im Test ist das derselbe Server.
  return new URL(link).hash;
}

const openLogin = openAuth;

test("Registrierung bestätigen, Passwort per E-Mail-Link zurücksetzen, mit dem neuen anmelden", async ({ page: firstPage, browser }) => {
  let page = firstPage;
  await fetch(SINK, { method: "DELETE" });
  const email = uniqueEmail("mail");

  // 1) Registrieren → Sperrseite
  await openLogin(page);
  await page.getByRole("button", { name: "Registrieren" }).first().click();
  await page.getByPlaceholder("z. B. max_grows").fill("Mail Tester");
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /AGB/ }).click();
  await page.getByRole("button", { name: "Konto erstellen" }).last().click();
  await expect(page.getByTestId("email-gate")).toBeVisible();
  await expect(page.getByTestId("gate-email")).toHaveText(email);

  // 2) Link aus der Mail öffnen → bestätigt → App
  const verify = await linkFor(email, "verify");
  await page.goto(`/${verify}`);
  await expect(page.getByTestId("verify-ok")).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
  expect(page.url()).not.toContain("verify=");

  // Der Link ist verbraucht
  const second = await page.context().newPage();
  await second.goto(`/${verify}`);
  await expect(second.getByTestId("verify-error")).toContainText(/ungültig oder abgelaufen/);
  await second.close();

  // 3) Passwort vergessen (frischer Browser, nicht angemeldet)
  const guest = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  page = await guest.newPage();
  await openLogin(page);
  await page.getByTestId("forgot-link").click();
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByRole("button", { name: "Link senden" }).click();
  await expect(page.getByTestId("forgot-sent")).toBeVisible();

  // 4) Reset-Link → neues Passwort
  const reset = await linkFor(email, "reset");
  await page.goto(`/${reset}`);
  await page.getByLabel(/^Neues Passwort(?! wiederholen)/).fill(NEW_PASSWORD);
  await page.getByLabel("Neues Passwort wiederholen").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page.getByTestId("reset-ok")).toBeVisible();
  await page.getByRole("button", { name: "Zur Anmeldung" }).click();

  // 5) Altes Passwort scheitert, neues klappt
  await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).last().click();
  await expect(page.getByText(/Anmeldedaten ungültig/).first()).toBeVisible();
  await page.getByPlaceholder("••••••••").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
});
