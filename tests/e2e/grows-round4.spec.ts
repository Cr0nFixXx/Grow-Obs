import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createGrow, makeTestFiles, openSettings, register, uniqueEmail } from "./helpers";

// Phase und Messtage rechnen in Europe/Berlin; der Browser soll dieselbe Kalendertag-Sicht haben.
test.use({ timezoneId: "Europe/Berlin", locale: "de-DE" });

const isoDaysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts;
};

/** B-88: Zielbereiche je Phase, CSV-Export, Foto-Vergleich, Erinnerungs-Einstellung. */
test("Grows Runde 4: Phasen-Ziele, CSV, Foto-Vergleich, Erinnerung", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "Grow Runde4", uniqueEmail("round4"));
  const name = `Runde4 ${Date.now()}`;
  await createGrow(page, { name, strains: "Runde Kush", start: isoDaysAgo(10) });
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Messwerte gestern (Keimung): EC 1,4 liegt über dem Keimlings-Richtwert 0,4–0,8
  await page.getByTestId("add-env").click();
  const env = page.getByTestId("env-form");
  await env.getByLabel("Datum").fill(isoDaysAgo(1));
  await env.getByLabel("EC").fill("1,4");
  await env.getByLabel("Temperatur").fill("24");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);
  await expect(page.locator('[data-alert="ec"]')).toContainText("über dem Zielbereich (0,4–0,8 mS, Keimung)");
  await expect(page.getByTestId("env-row").first()).toContainText("EC 1,4 ↑");

  // Phase auf Blüte: heutige Messung mit demselben EC ist dort in Ordnung (1,2–2); der gestrige Tag bleibt an die Keimung gemessen
  await page.getByTestId("phase-controls").getByRole("button", { name: "Blüte" }).click();
  await expect(page.getByTestId("phase-controls").getByRole("button", { name: "Blüte" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("add-env").click();
  await env.getByLabel("EC").fill("1,4");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(2);
  await expect(page.locator('[data-alert="ec"]')).toHaveCount(0);
  await expect(page.getByTestId("env-row").nth(0)).not.toContainText("EC 1,4 ↑");
  await expect(page.getByTestId("env-row").nth(1)).toContainText("EC 1,4 ↑");
  await expect(page.getByTestId("chart-feed")).toContainText("EC-Ziel je Phase");

  // Zielbereich je Größe überschreiben: Temperatur auf 18–20 °C → die Messung von gestern (24 °C) ist zu warm
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await expect(page.getByTestId("target-row-ph")).toContainText("Jetzt (Blüte): 5,8–6,5");
  await page.getByLabel("Temperatur: Zielbereich").selectOption("custom");
  await page.getByLabel("Temperatur Minimum").fill("18");
  await page.getByLabel("Temperatur Maximum").fill("20");
  await page.getByTestId("edit-grow-form").getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator('[data-alert="temp"]')).toContainText("über dem Zielbereich (18–20 °C");

  // CSV-Export: Messwerte und Tagebuch (Datei mit BOM, Semikolon, Dezimalkomma)
  await page.getByRole("button", { name: /^\+ Eintrag$/ }).click();
  await page.getByPlaceholder(/Komposttee/).fill("=Test; mit \"Anführungszeichen\"");
  await page.getByRole("button", { name: "Eintrag speichern" }).click();
  await expect(page.locator("#app-main").getByText(/Anführungszeichen/)).toBeVisible();
  const envDownload = page.waitForEvent("download");
  await page.getByTestId("export-env").click();
  const envFile = await envDownload;
  expect(envFile.suggestedFilename()).toMatch(/^runde4-\d+-messwerte-\d{4}-\d{2}-\d{2}\.csv$/);
  const envText = readFileSync((await envFile.path())!, "utf8");
  expect(envText.startsWith("\uFEFFDatum;Tag;Temperatur (°C);Luftfeuchte (%);VPD (kPa);EC (mS);pH\r\n")).toBe(true);
  expect(envText).toContain(";24;");
  expect(envText).toContain(";1,4;");
  expect(envText.trim().split("\r\n")).toHaveLength(3);
  const logDownload = page.waitForEvent("download");
  await page.getByTestId("export-logs").click();
  const logText = readFileSync((await (await logDownload).path())!, "utf8");
  expect(logText).toContain("Datum;Tag;Art;Titel;Notiz");
  expect(logText).toContain(`"'=Test; mit ""Anführungszeichen"""`); // Formel entschärft, Anführungszeichen verdoppelt

  // Foto-Vergleich: erst ab zwei Fotos
  await expect(page.getByTestId("compare-photos")).toHaveCount(0);
  const files = makeTestFiles();
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/gruen.png`);
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
  await expect(page.getByTestId("compare-photos")).toHaveCount(0);
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/braun.png`);
  await expect(page.getByTestId("grow-photo")).toHaveCount(2);
  await page.getByTestId("compare-photos").click();
  const compare = page.getByTestId("photo-compare");
  await expect(compare).toBeVisible();
  await expect(compare.getByTestId("compare-slider")).toContainText("Vorher · Tag 10");
  await expect(compare.getByTestId("compare-slider")).toContainText("Nachher · Tag 10");
  await compare.getByTestId("compare-range").fill("80");
  await expect(compare.getByTestId("compare-after-image")).toHaveCSS("clip-path", /inset\(0(px)? 0(px)? 0(px)? 80%\)|inset\(0px 0px 0px 80%\)/);
  await compare.getByRole("button", { name: "Nebeneinander" }).click();
  await expect(compare.getByTestId("compare-side").locator("img")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(compare).toHaveCount(0);

  // Erinnerung: in den Einstellungen einschalten, Tage wählen, bleibt nach dem Neuladen
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: /Erinnerung an Messwerte und Logs/ });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(page.getByTestId("reminder-days")).toHaveValue("2");
  await page.getByTestId("reminder-days").selectOption("4");
  await expect(page.getByTestId("reminder-days")).toHaveValue("4");
  await page.reload();
  await expect(page.getByTestId("sessions-card")).toBeVisible();
  await expect(page.getByTestId("reminder-days")).toHaveValue("4");
});
