import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test("Mobil (Pixel 5): Bottom-Navigation vorhanden, Menü öffnet, kein horizontaler Überlauf", async ({ page }) => {
  await register(page, "Mobile Tester", uniqueEmail("mobile"));
  for (const name of ["Home", "Grows", "Forum", "Profil", "Mehr"]) {
    await expect(page.getByRole("button", { name, exact: true }).last()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Forum", exact: true }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
});
