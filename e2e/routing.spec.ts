import { expect, test } from "@playwright/test";
import { PASSWORD, openSettings, register, uniqueEmail } from "./helpers";

const dashboard = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1, name: /^Hallo,/ });
const forumHeading = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1, name: "Forum" });

test.describe("URL-Routing (B-57)", () => {
  test("die Adresse folgt der Ansicht, Reload bleibt dort, Zurück/Vorwärts funktionieren", async ({ page }) => {
    await register(page, "Route Tester", uniqueEmail("route"));
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Forum", exact: true }).first().click();
    await expect(forumHeading(page)).toBeVisible();
    await expect(page).toHaveURL(/\/forum$/);

    await page.reload();
    await expect(forumHeading(page)).toBeVisible(); // vorher: Dashboard
    await expect(page).toHaveURL(/\/forum$/);

    await page.goBack();
    await expect(dashboard(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(forumHeading(page)).toBeVisible();
  });

  test("Detail-Link: Grow öffnen → /grows/<id>, Reload und „Zurück“-Button funktionieren", async ({ page }) => {
    await register(page, "Detail Tester", uniqueEmail("detail"));
    const name = `Route Grow ${Date.now()}`;
    await page.getByRole("button", { name: "Neuer Grow" }).first().click();
    await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
    await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("Route Haze");
    await page.getByRole("button", { name: "Grow anlegen" }).click();
    await page.getByRole("button", { name: "Meine Grows" }).first().click();
    await expect(page).toHaveURL(/\/grows$/);
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(/\/grows\/[A-Za-z0-9_-]+$/);

    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page).toHaveURL(/\/grows\/[A-Za-z0-9_-]+$/);

    // Direkt geöffneter Link hat keine App-History: der Zurück-Button führt trotzdem zur Liste.
    await page.getByRole("button", { name: /^Zurück/ }).first().click();
    await expect(page).toHaveURL(/\/grows$/);
  });

  test("tiefer Link im abgemeldeten Zustand: Anmeldung, danach das gewünschte Ziel", async ({ page }) => {
    const email = uniqueEmail("deeplink");
    await register(page, "Deep Tester", email);
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

    await page.goto("/forum");
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await page.getByPlaceholder("du@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(forumHeading(page)).toBeVisible();
    await expect(page).toHaveURL(/\/forum$/);
  });

  test("Profil-Tab steht in der URL und bleibt nach Reload", async ({ page }) => {
    await register(page, "Tab Tester", uniqueEmail("tab"));
    await openSettings(page);
    await expect(page).toHaveURL(/\/profile\/settings$/);
    await page.reload();
    await expect(page.getByTestId("password-card")).toBeVisible();
    await page.getByRole("button", { name: "Profil", exact: true }).first().click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("alter ?view=-Link wird zum Pfad, unbekannter Pfad führt zum Dashboard", async ({ page }) => {
    await register(page, "Legacy Tester", uniqueEmail("legacy"));
    await page.goto("/?view=forum");
    await expect(forumHeading(page)).toBeVisible();
    await expect(page).toHaveURL(/\/forum$/);

    await page.goto("/gibt-es-nicht");
    await expect(dashboard(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("API-Pfade bleiben unberührt (Catch-All überschreibt /api nicht)", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect((res.headers()["content-type"] ?? "")).toContain("json");
  });
});
