import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** B-84: Grow bearbeiten, Phase wechseln, ernten, wieder aufnehmen, archivieren, löschen. */
test("Grow-Lebenszyklus: Tag aus Startdatum, Phase, Zustand, Ernte, Archiv, Löschen", async ({ page }) => {
  await register(page, "Grow Zyklus", uniqueEmail("lifecycle"));
  const name = `Zyklus ${Date.now()}`;
  const start = new Date(Date.now() - 10 * 86_400_000);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("Zyklus Kush");
  await page.getByLabel(/Startdatum/).fill(iso);
  await page.getByRole("button", { name: "Grow anlegen" }).click();

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
