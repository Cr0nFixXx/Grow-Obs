import { expect, test } from "@playwright/test";
import { PASSWORD, openAuth, register, uniqueEmail } from "./helpers";

test.describe("Konto & Session", () => {
  test("Registrieren → Session übersteht Reload → Abmelden → erneut Anmelden", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "E2E Tester", email);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();

    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

    await page.getByPlaceholder("du@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
  });

  test("falsches Passwort zeigt Fehler und meldet nicht an", async ({ page }) => {
    await openAuth(page);
    await page.getByPlaceholder("du@example.com").fill(uniqueEmail("nobody"));
    await page.getByPlaceholder("••••••••").fill("falsches-passwort");
    await page.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(page.getByText("Anmeldedaten ungültig")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
  });

  test("Registrierung verlangt Zustimmung zu AGB/Datenschutz", async ({ page }) => {
    await openAuth(page);
    await page.getByRole("button", { name: "Registrieren" }).first().click();
    await page.getByPlaceholder("z. B. max_grows").fill("Ohne Haken");
    await page.getByPlaceholder("du@example.com").fill(uniqueEmail());
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Konto erstellen" }).last().click();
    await expect(page.getByText("Zustimmung fehlt")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
  });
});

test.describe("Kernfunktionen (angemeldet)", () => {
  test("Grow anlegen → erscheint unter „Meine Grows“ und bleibt nach Reload", async ({ page }) => {
    await register(page, "Grow Tester", uniqueEmail("grow"));
    const name = `E2E Grow ${Date.now()}`;

    await page.getByRole("button", { name: "Neuer Grow" }).first().click();
    await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
    await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("E2E Haze");
    await page.getByRole("button", { name: "Grow anlegen" }).click();

    await page.getByRole("button", { name: "Meine Grows" }).first().click();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Meine Grows" }).first().click();
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("Forum-Thread veröffentlichen → in der Liste sichtbar, nach Reload noch da", async ({ page }) => {
    await register(page, "Forum Tester", uniqueEmail("forum"));
    const title = `E2E Thread ${Date.now()}`;

    await page.getByRole("button", { name: "Forum", exact: true }).first().click();
    await page.getByRole("button", { name: "+ Thread" }).click();
    await page.getByPlaceholder("Worum geht es?").fill(title);
    await page.getByPlaceholder("Teile dein Wissen oder stell eine Frage…").fill("Dies ist ein automatisierter E2E-Beitrag.");
    await page.getByRole("button", { name: "Thread veröffentlichen" }).click();
    await expect(page.getByText(title).first()).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Forum", exact: true }).first().click();
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("Deep-Link ?view=forum öffnet nach Login das Forum", async ({ page }) => {
    await register(page, "Link Tester", uniqueEmail("link"));
    await page.goto("/?view=forum");
    await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
  });
});

test.describe("Bekannte Lücken (dokumentiert)", () => {
  // Dashboard zeigt im API-Modus statische Demo-Zahlen (src/mocks/data) auch für neue Nutzer.
  test.fixme("neuer Nutzer sieht auf dem Dashboard keine Demo-Daten (168 € / 94 % Gesundheit)", async ({ page }) => {
    await register(page, "Leer Tester", uniqueEmail("empty"));
    await expect(page.getByText("168 €")).toHaveCount(0);
    await expect(page.getByText("94 %")).toHaveCount(0);
  });
});
