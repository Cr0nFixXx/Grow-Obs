import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** B-90: Titelleiste „Grow|Obs“ führt zur Startseite; Kacheln und Aktivität der Startseite öffnen ihren Bereich. */
test("Startseite: Marke, Kacheln und Aktivität sind anklickbar", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "Home Klick", uniqueEmail("homeclick"));
  await expect(page).toHaveTitle(/Grow\|Obs/);

  await page.getByText("Aktive Grows", { exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Grows" })).toBeVisible();

  await page.getByRole("button", { name: "Grow|Obs – zur Startseite" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();

  await page.getByText("Brauchen Aufmerksamkeit", { exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Grows" })).toBeVisible();

  await page.getByRole("button", { name: "Grow|Obs – zur Startseite" }).first().click();
  await page.getByText("Offene Tasks", { exact: true }).click();
  await expect(page.locator("#dashboard-tasks")).toBeInViewport();
});
