import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PASSWORD, createGrow, openAuth, register, uniqueEmail } from "./helpers";

test.describe("Versionierung", () => {
  test("Login-Seite zeigt Codename, Frontend-Version und Build; /api/version nennt Frontend und Backend", async ({ page, request }) => {
    const config = JSON.parse(readFileSync(path.resolve("version.json"), "utf8")) as { frontend: { codename: string; version: string }; backend: { version: string }; build: string };
    await openAuth(page);
    await expect(page.getByTestId("app-version")).toHaveText(`${config.frontend.codename} v${config.frontend.version} · Build ${config.build}`);

    const body = await (await request.get("/api/version")).json();
    expect(body).toMatchObject({ version: config.frontend.version, codename: config.frontend.codename, buildNumber: config.build, backend: { version: config.backend.version } });
    expect(typeof body.build).toBe("string"); // Laufzeit-ID für die Update-Erkennung bleibt erhalten
  });
});

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

    await createGrow(page, { name, strains: "E2E Haze" });

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

test.describe("Keine Demo-Daten im API-Modus", () => {
  test("neuer Nutzer sieht auf dem Dashboard nur Leerzustände statt Demo-Zahlen", async ({ page }) => {
    await register(page, "Leer Tester", uniqueEmail("empty"));
    for (const fake of ["168 €", "94 %", "12.400", "3.200", "Kosten / Monat"]) {
      await expect(page.getByText(fake, { exact: false })).toHaveCount(0);
    }
    await expect(page.getByText("Noch kein aktiver Grow")).toBeVisible();
    await expect(page.getByText("Noch keine Klimadaten")).toBeVisible();
    await expect(page.getByText("Aktive Grows", { exact: true }).first()).toBeVisible();
  });

  test("Avatar ohne Bild zeigt Initialen statt eines Fremdfotos", async ({ page }) => {
    await register(page, "Leer Tester", uniqueEmail("avatar"));
    const fallback = page.locator("[data-avatar-fallback]").first();
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveText("LT");
    await expect(page.locator('img[src*="unsplash"]')).toHaveCount(0);
  });

  test("Registrierung zeigt Passwort-Hinweis und keine erfundenen Nutzerzahlen", async ({ page }) => {
    await openAuth(page);
    await page.getByRole("button", { name: "Registrieren" }).first().click();
    await expect(page.getByText("Mindestens 12 Zeichen.")).toBeVisible();
    await expect(page.getByText("12.400")).toHaveCount(0);
  });

  test("KI-Assistent ist ehrlich: nicht angebunden, Eingabe gesperrt", async ({ page }) => {
    await register(page, "Ki Tester", uniqueEmail("ki"));
    await page.getByRole("button", { name: "KI-Assistent" }).first().click();
    await expect(page.getByText("KI noch nicht angebunden", { exact: false }).first()).toBeVisible();
    await expect(page.getByPlaceholder("Frag den KI-Assistenten…")).toBeDisabled();
    await expect(page.getByText("Gespräche")).toHaveCount(0);
  });

  test("Community-Feed erfindet keine Stories und Vorschläge", async ({ page }) => {
    await register(page, "Feed Tester", uniqueEmail("feed"));
    await page.goto("/?view=social");
    await expect(page.getByRole("heading", { level: 1, name: /Community|Feed/ })).toBeVisible();
    await expect(page.getByText("Stories sind noch nicht verfügbar.")).toBeVisible();
    await expect(page.getByText("Vorschläge sind noch nicht verfügbar.")).toBeVisible();
  });
});
