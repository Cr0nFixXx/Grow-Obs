import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/**
 * Web-Push in der Oberfläche (B-63). Der Browser fragt die Berechtigung ab und abonniert beim echten Push-Dienst des Herstellers;
 * in Umgebungen ohne Zugang (CI, Headless-Sandbox: Berechtigung bleibt „blockiert“) schlägt das fehl – dann wird der Test übersprungen.
 * Nicht geprüft: Zustellung an ein echtes Gerät (Sperrbildschirm, iOS).
 */
test.describe("Push-Einstellungen", () => {
  test("Karte zeigt Kategorien, Vorschau und Ruhezeit; Einstellungen bleiben nach dem Neuladen erhalten", async ({ page }) => {
    await register(page, `push${Date.now().toString(36)}`, uniqueEmail("push"));
    await page.goto("/profile/settings");
    const card = page.getByTestId("push-card");
    await expect(card.getByRole("heading", { name: "Push-Benachrichtigungen" })).toBeVisible();
    await expect(card.getByTestId("push-prefs")).toBeVisible();

    await card.getByRole("switch", { name: "Community & Forum" }).click();
    await card.getByRole("switch", { name: "Ruhezeit" }).click();
    await card.getByLabel("Ruhezeit von").fill("23:15");
    await expect(card.getByLabel("Ruhezeit von")).toHaveValue("23:15");

    await page.reload();
    const again = page.getByTestId("push-card");
    await expect(again.getByRole("switch", { name: "Community & Forum" })).toHaveAttribute("aria-checked", "false");
    await expect(again.getByRole("switch", { name: "Nachrichten" })).toHaveAttribute("aria-checked", "true");
    await expect(again.getByLabel("Ruhezeit von")).toHaveValue("23:15");
  });

  test("Gerät aktivieren und wieder abmelden (nur mit erreichbarem Push-Dienst)", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    await register(page, `push${Date.now().toString(36)}`, uniqueEmail("push"));
    await page.goto("/profile/settings");
    const card = page.getByTestId("push-card");
    const toggle = card.getByRole("switch", { name: "Auf diesem Gerät aktivieren" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const failed = page.getByText("Nicht aktiviert");
    const active = card.getByText("Aktiv", { exact: true });
    await expect(failed.or(active)).toBeVisible({ timeout: 20_000 });
    test.skip(await failed.isVisible(), "Browser erlaubt hier keine Benachrichtigungen oder erreicht den Push-Dienst nicht");
    await expect(card.getByTestId("push-device")).toHaveCount(1);
    await toggle.click();
    await expect(card.getByTestId("push-device")).toHaveCount(0);
  });
});
