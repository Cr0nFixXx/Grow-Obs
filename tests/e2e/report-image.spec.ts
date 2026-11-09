import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test.use({ timezoneId: "Europe/Berlin", locale: "de-DE" });

/** B-90: „Grow-Report als Bild speichern“ liefert wirklich eine PNG-Datei. */
test("Grow-Report: Bild-Export speichert ein PNG", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "Report Bild", uniqueEmail("reportimg"));
  const name = `Report ${Date.now()}`;
  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("Bild Kush");
  await page.getByRole("button", { name: "Grow anlegen" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByTestId("add-env").click();
  const env = page.getByTestId("env-form");
  await env.getByLabel("Temperatur").fill("24");
  await env.getByLabel("Luftfeuchte").fill("60");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);

  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Grow-Report" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Bild", exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/-report-\d{4}-\d{2}-\d{2}\.png$/);
  const path = (await download.path())!;
  const bytes = readFileSync(path);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.length).toBeGreaterThan(10_000);
  await expect(page.getByText("Bild gespeichert")).toBeVisible();
  if (process.env.KEEP_REPORT_PNG) { mkdirSync(process.env.KEEP_REPORT_PNG, { recursive: true }); copyFileSync(path, `${process.env.KEEP_REPORT_PNG}/report.png`); }
});
