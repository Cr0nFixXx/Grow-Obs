import { expect, test } from "@playwright/test";
import { openSettings, register, uniqueEmail } from "./helpers";

/** B-95: „Was ist neu“ erscheint einmal nach dem Update (Bestandsinstallation) und bleibt in den Einstellungen erreichbar. */
test("Was ist neu: einmaliges Fenster für Bestandsinstallation, nicht für frische; dauerhaft in den Einstellungen", async ({ page }) => {
  test.setTimeout(90_000);
  // Frische Installation: kein Fenster
  await register(page, "wn_fresh", uniqueEmail("wn_fresh"));
  await expect(page.getByTestId("whats-new-entry")).toHaveCount(0);

  // Bestandsinstallation simulieren: alte Update-Daten vorhanden, aber keine Kennung des letzten Eintrags
  await page.evaluate(() => { localStorage.removeItem("go-whats-new-seen"); localStorage.setItem("go-releases-seen-at", new Date().toISOString()); });
  await page.reload();
  const sheet = page.getByTestId("whats-new-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByTestId("whats-new-entry")).toHaveCount(3);
  await expect(sheet.getByTestId("changelog-link")).toHaveAttribute("href", /docs\/CHANGELOG\.md$/);
  await sheet.getByRole("button", { name: "Verstanden" }).click();
  await expect(sheet).toHaveCount(0);

  // Kein zweites Mal
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("whats-new-sheet")).toHaveCount(0);

  // Dauerhaft: Profil → Einstellungen → Updates & Was ist neu
  await openSettings(page);
  await page.getByTestId("open-whats-new").click();
  const again = page.getByTestId("whats-new-sheet");
  await expect(again.getByTestId("whats-new-entry")).toHaveCount(5);
  await expect(again.getByText("Chat: auswählen, antworten, aufräumen")).toBeVisible();
});
