import { expect, test } from "@playwright/test";
import { createGrow, makeTestFiles, register, uniqueEmail } from "./helpers";

/** B-84: Grow bearbeiten, Phase wechseln, ernten, wieder aufnehmen, archivieren, löschen. */
test("Grow-Lebenszyklus: Tag aus Startdatum, Phase, Zustand, Ernte, Archiv, Löschen", async ({ page }) => {
  await register(page, "Grow Zyklus", uniqueEmail("lifecycle"));
  const name = `Zyklus ${Date.now()}`;
  const start = new Date(Date.now() - 10 * 86_400_000);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

  await createGrow(page, { name, strains: "Zyklus Kush", start: iso });

  // Detail: Tag kommt aus dem Startdatum, Phase Keimung
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/^(9|10|11)\/84$/)).toBeVisible();
  await expect(page.getByTestId("phase-controls")).toBeVisible();

  // Phase und Zustand
  await page.getByTestId("phase-controls").getByRole("button", { name: "Blüte" }).click();
  await expect(page.getByTestId("phase-controls").getByRole("button", { name: "Blüte" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Beobachten" }).click();
  await expect(page.getByRole("button", { name: "Beobachten" })).toHaveAttribute("aria-pressed", "true");

  // Bearbeiten
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  const renamed = `${name} bearbeitet`;
  await page.getByTestId("edit-grow-form").getByLabel(/Name des Grows/).fill(renamed);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

  // Ernte abschließen
  await page.getByTestId("finish-harvest").click();
  const form = page.getByTestId("finish-grow-form");
  await form.getByLabel(/Nassgewicht/).fill("400");
  await form.getByLabel(/Trockengewicht/).fill("90");
  await form.getByLabel(/Notiz/).fill("Harzig");
  await form.getByRole("button", { name: "Ernte abschließen" }).click();
  const result = page.getByTestId("grow-result");
  await expect(result).toContainText("Geerntet");
  await expect(result).toContainText("400 g");
  await expect(result).toContainText("90 g");
  await expect(page.getByTestId("phase-controls")).toHaveCount(0);

  // Wieder aufnehmen
  await result.getByRole("button", { name: /Wieder aufnehmen/ }).click();
  await expect(page.getByTestId("phase-controls")).toBeVisible();

  // Archivieren → verschwindet aus „Aktiv“, steht im Archiv
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Archivieren" }).click();
  await expect(page.getByTestId("grow-archived-banner")).toBeVisible();
  await page.getByRole("button", { name: "Meine Grows" }).first().click();
  await expect(page.getByRole("button", { name: /Aktiv \(\d+\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(renamed) })).toHaveCount(0);
  await page.getByRole("button", { name: /Archiv \(1\)/ }).click();
  await page.getByRole("button", { name: new RegExp(renamed) }).click();

  // Löschen nach Bestätigung
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Löschen/ }).click();
  await expect(page.getByTestId("delete-grow-dialog")).toContainText("unwiderruflich");
  await page.getByRole("button", { name: /Endgültig löschen/ }).click();
  await expect(page.getByRole("heading", { name: "Meine Grows" })).toBeVisible();
  await page.getByRole("button", { name: /Archiv \(0\)/ }).click();
  await expect(page.getByText("Das Archiv ist leer")).toBeVisible();
});

const isoDaysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** B-85: Tagebuch mit Datum, Messwerte je Tag mit berechnetem VPD, Diagramme, Fotos verwalten. */
test("Grow-Tagebuch: Log mit Datum bearbeiten, Messwerte, Diagramme, Fotos", async ({ page }) => {
  await register(page, "Grow Tagebuch", uniqueEmail("diary"));
  const name = `Tagebuch ${Date.now()}`;
  await createGrow(page, { name, strains: "Tagebuch Kush", start: isoDaysAgo(10) });
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Log mit rückwirkendem Datum: Tag wird berechnet
  await page.getByRole("button", { name: /^\+ Eintrag$/ }).click();
  await page.getByLabel("Datum").fill(isoDaysAgo(4));
  await page.getByPlaceholder(/Komposttee/).fill("Erste Düngung");
  await page.getByRole("button", { name: "Eintrag speichern" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.locator("#app-main").getByText("Erste Düngung")).toBeVisible();
  await expect(page.getByText(/Tag 6 ·/)).toBeVisible();

  // Log bearbeiten (Titel + Datum)
  await page.getByTestId("edit-log").first().click();
  const logForm = page.getByTestId("edit-log-form");
  await logForm.getByLabel("Titel").fill("Zweite Düngung");
  await logForm.getByLabel("Datum").fill(isoDaysAgo(2));
  await logForm.getByRole("button", { name: "Speichern" }).click();
  // Im Hauptbereich suchen: Die Erfolgsmeldung (Toast) nennt den Titel ebenfalls.
  await expect(page.locator("#app-main").getByText("Zweite Düngung")).toBeVisible();
  await expect(page.getByText(/Tag 8 ·/)).toBeVisible();

  // Messwerte: Live-VPD, speichern, zweiter Tag, Diagramme
  await page.getByTestId("add-env").click();
  const env = page.getByTestId("env-form");
  await env.getByLabel("Temperatur").fill("25");
  await env.getByLabel("Luftfeuchte").fill("60");
  await env.getByLabel("pH").fill("6,3");
  await expect(page.getByTestId("env-vpd")).toContainText("0,91 kPa");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);

  await page.getByTestId("add-env").click();
  await env.getByLabel("Datum").fill(isoDaysAgo(1));
  await env.getByLabel("EC").fill("1,4");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(2);
  await expect(page.getByTestId("chart-climate").locator('[data-series="temp"] circle')).toHaveCount(1);
  await expect(page.getByTestId("chart-feed").locator('[data-series="ph"] circle')).toHaveCount(1);
  await expect(page.getByTestId("chart-feed").locator('[data-series="ec"] circle')).toHaveCount(1);
  await expect(page.getByTestId("chart-vpd").locator('[data-series="vpd"] circle')).toHaveCount(1);

  // Tag erneut speichern überschreibt (kein Duplikat); löschen
  await page.getByTestId("add-env").click();
  await env.getByLabel("Temperatur").fill("22");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(2);
  await page.getByRole("button", { name: /Messwerte vom .* bearbeiten/ }).last().click();
  await page.getByTestId("delete-env").click();
  await page.getByTestId("confirm-delete-env").click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);

  // Zielbereiche (B-86): pH 7,4 liegt über 5,8–6,5 → Hinweis, rote Markierung; Bereich anpassen → Hinweis weg
  await page.getByRole("button", { name: /Messwerte vom .* bearbeiten/ }).first().click();
  await env.getByLabel("pH").fill("7,4");
  await env.getByRole("button", { name: "Speichern" }).click();
  const alerts = page.getByTestId("range-alerts");
  await expect(alerts).toContainText("pH 7,4");
  await expect(alerts).toContainText("über dem Zielbereich (5,8–6,5, Keimung)");
  await expect(page.getByTestId("chart-feed").locator('[data-series="ph"] circle[data-out="high"]')).toHaveCount(1);
  await expect(page.getByTestId("env-row").first()).toContainText("pH 7,4 ↑");
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await page.getByLabel("pH: Zielbereich").selectOption("custom");
  await page.getByLabel("pH Minimum").fill("5,8");
  await page.getByLabel("pH Maximum").fill("8");
  await page.getByTestId("edit-grow-form").getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator('[data-alert="ph"]')).toHaveCount(0); // (VPD 22 °C/60 % liegt unter dem Ziel – bleibt als Hinweis)
  await expect(page.getByTestId("chart-feed").locator('[data-series="ph"] circle[data-out="high"]')).toHaveCount(0);

  // Zeitraum 7 Tage umschalten ohne Fehler
  await page.getByRole("button", { name: "7 Tage" }).click();
  await expect(page.getByTestId("chart-climate")).toBeVisible();

  // Fotos: hochladen, Bildunterschrift, Titelbild, löschen
  const files = makeTestFiles();
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/gruen.png`);
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/braun.png`);
  await expect(page.getByTestId("grow-photo")).toHaveCount(2);
  await page.getByTestId("edit-photo").nth(1).click();
  const dialog = page.getByTestId("photo-dialog");
  await dialog.getByLabel(/Bildunterschrift/).fill("Tag 10");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("#app-main").getByText("Tag 10", { exact: true })).toBeVisible();
  await page.getByTestId("edit-photo").nth(1).click();
  await page.getByTestId("photo-cover").click();
  await expect(page.getByText("Titelbild", { exact: true })).toHaveCount(1);
  await page.getByTestId("edit-photo").nth(1).click();
  await page.getByTestId("delete-photo").click();
  await page.getByTestId("confirm-delete-photo").click();
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
});
