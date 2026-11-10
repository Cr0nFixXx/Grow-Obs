import { expect, test } from "@playwright/test";
import { PASSWORD, createGrow, openSettings, register, uniqueEmail } from "./helpers";

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
    await createGrow(page, { name, strains: "Route Haze" });
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

  test("alter ?view=-Link wird zum Pfad", async ({ page }) => {
    await register(page, "Legacy Tester", uniqueEmail("legacy"));
    await page.goto("/?view=forum");
    await expect(forumHeading(page)).toBeVisible();
    await expect(page).toHaveURL(/\/forum$/);
  });

  test("API-Pfade bleiben unberührt (Catch-All überschreibt /api nicht)", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect((res.headers()["content-type"] ?? "")).toContain("json");
  });
});

test.describe("404-Seite und Sorten-Link (B-62)", () => {
  test("unbekannte, zu tiefe und unsichere Pfade antworten mit HTTP 404; gültige mit 200", async ({ request }) => {
    for (const path of ["/gibt-es-nicht", "/grows/a/b", "/grows/%3Cscript%3E", "/profile/hacker", "/strains/x/y", "/auth"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toContain("Seite nicht gefunden");
    }
    for (const path of ["/", "/grows", "/strains/abc123", "/hall-of-fame", "/profile/settings"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    expect((await request.get("/api/gibt-es-nicht")).status()).toBe(404); // API-404 bleibt JSON
    expect((await request.get("/%E0%A4%A")).status()).toBe(400); // kaputte Kodierung: 400 statt 500
  });

  test("Server-404 zeigt Hinweis + Startseite-Link; die App-404 lässt die Adresse stehen und führt zum Dashboard", async ({ page }) => {
    await register(page, "NotFound Tester", uniqueEmail("nf"));
    const res = await page.goto("/gibt-es-nicht");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Seite nicht gefunden" })).toBeVisible();
    await page.getByRole("link", { name: "Zur Startseite" }).click();
    await expect(dashboard(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    // In der App (z. B. Zurück auf einen ungültigen Eintrag): 404-Ansicht, Adresse bleibt, Dashboard-Button führt weg
    await page.evaluate(() => { window.history.pushState(null, "", "/kaputt"); window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
    await expect(page.getByTestId("not-found")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Seite nicht gefunden" })).toBeVisible();
    await expect(page).toHaveURL(/\/kaputt$/);
    await page.getByRole("button", { name: "Zum Dashboard" }).click();
    await expect(dashboard(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Sorte: Öffnen setzt /strains/<id>, Reload und Direktlink zeigen das Detail, Zurück schließt es, unbekannte ID → Hinweis", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await register(page, "Strain Tester", uniqueEmail("strain"));
    const name = `Linksorte ${Date.now().toString(36)}`;
    const created = await page.request.post("/api/strains", { data: { name, breeder: "E2E Seeds", type: "Hybrid", thc: 20, cbd: 1, flowering: 9, yield: "400 g", difficulty: 2, price: 12, notes: "Für den Link-Test", effects: ["Ruhig"] } });
    expect(created.status()).toBe(201);
    const { id } = await created.json() as { id: string };

    await page.goto("/strains");
    await page.getByText(name).first().click();
    await expect(page).toHaveURL(new RegExp(`/strains/${id}$`));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Für den Link-Test");

    await page.reload();
    await expect(page.getByRole("dialog")).toContainText("Für den Link-Test");
    await page.getByRole("dialog").getByRole("button", { name: "Link teilen" }).click();
    await expect(page.getByText("Link kopiert")).toBeVisible();

    await page.goBack(); // Reload hat keinen Vorgänger → zurück zur Liste ohne Detail
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/strains$/);

    await page.goto("/strains/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Sorte nicht gefunden")).toBeVisible();
    await expect(page).toHaveURL(/\/strains$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
