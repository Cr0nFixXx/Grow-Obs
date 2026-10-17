import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { PASSWORD, login, register, uniqueEmail } from "./helpers";

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_e2e";
const NEW = "e2e-chosen-own-password-1";

/** Simuliert ein per `admin:create` angelegtes Konto (Einmalpasswort) – die CLI selbst deckt der API-Test ab. */
async function setMustChange(email: string, value: boolean) {
  const sql = postgres(databaseUrl, { max: 1 });
  try { await sql`update users set must_change_password = ${value} where email = ${email}`; }
  finally { await sql.end({ timeout: 5 }); }
}
const forced = (page: Page) => page.getByTestId("forced-password-change");

test.describe("Erzwungener Passwortwechsel (B-58)", () => {
  test("Konto mit Einmalpasswort sieht nur die Passwort-Sperre, bis es ein neues Passwort gesetzt hat", async ({ page, browser }) => {
    const email = uniqueEmail("forced");
    await register(page, "Chef Tester", email);
    await setMustChange(email, true);

    await page.reload();
    await expect(forced(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Neues Passwort festlegen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meine Grows" })).toHaveCount(0); // keine App dahinter

    await page.goto("/grows"); // auch ein tiefer Link umgeht die Sperre nicht
    await expect(forced(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Meine Grows" })).toHaveCount(0);

    const card = page.getByTestId("password-card");
    await card.getByLabel(/^Aktuelles Passwort/).fill("falsches-passwort-lang");
    await card.getByLabel(/^Neues Passwort(?! wiederholen)/).fill(NEW);
    await card.getByLabel(/^Neues Passwort wiederholen/).fill(NEW);
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(card.getByRole("alert")).toHaveText(/Aktuelles Passwort ist falsch/);
    await expect(forced(page)).toBeVisible();

    await card.getByLabel(/^Aktuelles Passwort/).fill(PASSWORD);
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(forced(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Meine Grows" }).first()).toBeVisible(); // App offen, URL /grows bleibt
    await expect(page).toHaveURL(/\/grows$/);

    await page.reload();
    await expect(forced(page)).toHaveCount(0);

    const other = await (await browser.newContext()).newPage();
    await login(other, email, NEW);
    await other.context().close();
  });

  test("aus der Sperre kann man sich abmelden", async ({ page }) => {
    const email = uniqueEmail("forced-out");
    await register(page, "Logout Tester", email);
    await setMustChange(email, true);
    await page.reload();
    await expect(forced(page)).toBeVisible();
    await forced(page).getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
  });
});
