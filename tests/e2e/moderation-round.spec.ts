import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { PASSWORD, login, register, uniqueEmail } from "./helpers";

const dbUrl = process.env.E2E_DATABASE_URL ?? "postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_e2e";

async function openDevAdmin(page: Page) {
  await page.getByRole("button", { name: "Developer-Admin" }).first().click();
  await expect(page.getByRole("button", { name: "Benutzer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Benutzer", exact: true }).click();
}

test.describe("Moderations-Runde (B-89)", () => {
  test("Betreiber sperrt ein Konto mit Grund, hebt die Sperre auf und löscht es; alles steht im Protokoll", async ({ browser }) => {
    test.setTimeout(120_000);
    const victimEmail = uniqueEmail("b89v");
    const adminEmail = uniqueEmail("b89a");

    const victimCtx = await browser.newContext();
    const victim = await victimCtx.newPage();
    await register(victim, "Spam Sam", victimEmail);

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await register(admin, "Boss Bea", adminEmail);
    const sql = postgres(dbUrl, { max: 1 });
    try { await sql`update users set role = 'platform_admin' where email = ${adminEmail}`; } finally { await sql.end(); }
    await adminCtx.close();
    const adminCtx2 = await browser.newContext();
    const boss = await adminCtx2.newPage();
    await login(boss, adminEmail);

    await openDevAdmin(boss);
    const row = boss.getByRole("listitem").filter({ hasText: victimEmail }).last();
    await row.getByRole("button", { name: "Sperren" }).click();
    await boss.getByPlaceholder(/Spam in mehreren/).fill("Werbung in allen Kanälen");
    await boss.getByRole("dialog").getByRole("button", { name: "Sperren" }).click();
    await expect(row.getByText(/Gesperrt: Werbung in allen Kanälen/)).toBeVisible();

    // Das gesperrte Mitglied sieht den Grund beim Anmelden
    const bannedCtx = await browser.newContext();
    const banned = await bannedCtx.newPage();
    await banned.goto("/");
    await banned.getByText("Überspringen").click();
    await banned.getByPlaceholder("du@example.com").fill(victimEmail);
    await banned.getByPlaceholder("••••••••").fill(PASSWORD);
    await banned.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(banned.getByText(/Werbung in allen Kanälen/).first()).toBeVisible();
    await expect(banned.getByRole("heading", { level: 1, name: /^Hallo,/ })).toHaveCount(0);
    await bannedCtx.close();

    // Entsperren, dann Login wieder möglich
    await row.getByRole("button", { name: "Entsperren" }).click();
    await expect(row.getByRole("button", { name: "Sperren" })).toBeVisible();
    const againCtx = await browser.newContext();
    await login(await againCtx.newPage(), victimEmail);
    await againCtx.close();

    // Löschen: braucht Passwort und LÖSCHEN
    await row.getByRole("button", { name: "Löschen" }).click();
    const dialog = boss.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Konto löschen" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Dein Passwort").fill(PASSWORD);
    await dialog.getByLabel(/^Tippe LÖSCHEN/).fill("LÖSCHEN");
    await confirm.click();
    await expect(boss.getByRole("listitem").filter({ hasText: victimEmail })).toHaveCount(0);

    // Protokoll
    await boss.getByRole("button", { name: "Moderationsprotokoll", exact: true }).click();
    await expect(boss.getByText("Konto gesperrt").first()).toBeVisible();
    await expect(boss.getByText("Konto gelöscht").first()).toBeVisible();
    await expect(boss.getByText("Sperre aufgehoben").first()).toBeVisible();
    await victimCtx.close(); await adminCtx2.close();
  });
});
