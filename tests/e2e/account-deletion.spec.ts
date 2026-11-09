import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { PASSWORD, openSettings, register, uniqueEmail } from "./helpers";

test.describe("Konto & Daten (B-74)", () => {
  test("Export liefert ein ZIP mit daten.json, danach lässt sich das Konto löschen und der Login ist gesperrt", async ({ page }) => {
    const email = uniqueEmail("b74");
    await register(page, "Loesch Tester", email);
    await openSettings(page);

    // Export: falsches Passwort wird abgelehnt, richtiges startet den Download
    const exportCard = page.getByTestId("export-card");
    await exportCard.getByLabel(/^Passwort/).fill("falsches-passwort-lang");
    await exportCard.getByRole("button", { name: "Daten herunterladen" }).click();
    await expect(exportCard.getByRole("alert")).toHaveText(/falsch/);
    await exportCard.getByLabel(/^Passwort/).fill(PASSWORD);
    const [download] = await Promise.all([page.waitForEvent("download"), exportCard.getByRole("button", { name: "Daten herunterladen" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^grow-observer-daten-\d{4}-\d{2}-\d{2}\.zip$/);
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    const data = JSON.parse(strFromU8(files["daten.json"]!));
    expect(data.konto.email).toBe(email);
    expect(JSON.stringify(data)).not.toContain("passwordHash");

    // Löschen: Button bleibt gesperrt, bis Passwort und Wort stimmen
    const zone = page.getByTestId("danger-zone");
    await zone.getByRole("button", { name: /Konto löschen/ }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Konto löschen" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/^Passwort/).fill(PASSWORD);
    await dialog.getByLabel(/^Tippe LÖSCHEN/).fill("LÖSCHEN");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Danach: abgemeldet, Anmeldung mit den alten Daten nicht mehr möglich
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await page.getByPlaceholder("du@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toHaveCount(0);
    await expect(page.getByRole("alert").first()).toBeVisible();

    // Die E-Mail-Adresse ist wieder frei: neu registrieren geht
    await page.getByRole("button", { name: "Registrieren" }).first().click();
    await page.getByPlaceholder("z. B. max_grows").fill("Loesch Tester");
    await page.getByPlaceholder("du@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("checkbox", { name: /AGB/ }).click();
    await page.getByRole("button", { name: "Konto erstellen" }).last().click();
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
  });
});
