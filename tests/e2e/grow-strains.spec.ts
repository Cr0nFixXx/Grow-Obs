import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** B-100: ein Grow mit mehreren Sorten – anlegen, Anzeige, bearbeiten, Ernte-Gewichte je Sorte. */
test("Grow mit mehreren Sorten: anlegen, Kurzanzeige, Details, bearbeiten, Ernte je Sorte", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page, "Grow Mix", uniqueEmail("strains"));
  const name = `Mix ${Date.now().toString(36)}`;

  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("Gorilla Glue");
  await page.getByLabel("Breeder zu Sorte 1").fill("Dutch Passion");
  await page.getByLabel("Pflanzen von Sorte 1").fill("2");
  await page.getByTestId("strain-add").click();
  await page.getByLabel("Sorte 2", { exact: true }).fill("Northern Haze");
  await page.getByLabel("Pflanzen von Sorte 2").fill("1");
  await page.getByTestId("strain-add").click();
  await page.getByLabel("Sorte 3", { exact: true }).fill("Eigene Kreuzung");
  await expect(page.getByTestId("strain-row")).toHaveCount(3);

  // doppelte Sorte wird abgelehnt
  await page.getByTestId("strain-add").click();
  await page.getByLabel("Sorte 4", { exact: true }).fill("northern haze");
  await page.getByRole("button", { name: "Grow anlegen" }).click();
  await expect(page.getByText(/ist doppelt eingetragen/)).toBeVisible();
  await page.getByLabel("Sorte 4 entfernen").click();
  await expect(page.getByTestId("strain-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Grow anlegen" }).click();

  // Detail: alle Sorten mit Breeder und Pflanzen, Kopfzeile kurz
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const card = page.getByTestId("grow-strains");
  await expect(card).toContainText("Sorten (3) · 3 Pflanzen");
  await expect(card.getByTestId("grow-strain-row")).toHaveCount(3);
  await expect(card).toContainText("Gorilla Glue");
  await expect(card).toContainText("Dutch Passion");
  await expect(card).toContainText("2 Pflanzen");
  await expect(page.getByText("Gorilla Glue und 2 weitere · Dutch Passion")).toBeVisible();

  // Bearbeiten: Sorte entfernen
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  const edit = page.getByTestId("edit-grow-form");
  await expect(edit.getByTestId("strain-row")).toHaveCount(3);
  await edit.getByLabel("Sorte 3 entfernen").click();
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("grow-strains")).toContainText("Sorten (2) · 3 Pflanzen");

  // Ernte mit Gewichten je Sorte
  await page.getByTestId("finish-harvest").click();
  const form = page.getByTestId("finish-grow-form");
  await expect(form.getByTestId("strain-weight-row")).toHaveCount(2);
  await form.getByLabel("Nassgewicht Gorilla Glue").fill("400");
  await form.getByLabel("Trockengewicht Gorilla Glue").fill("100");
  await form.getByLabel("Nassgewicht Northern Haze").fill("300");
  await form.getByLabel("Trockengewicht Northern Haze").fill("80");
  await expect(form.getByTestId("strain-weights-total")).toContainText("nass 700 g, trocken 180 g");
  await form.getByRole("button", { name: "Ernte abschließen" }).click();
  await expect(page.getByTestId("grow-result")).toContainText("700 g");
  await expect(page.getByTestId("grow-result")).toContainText("180 g");
  await expect(page.getByTestId("grow-strains")).toContainText("nass 400 g · trocken 100 g");

  // Liste: Karte zeigt die erste Sorte plus Zähler
  await page.getByRole("button", { name: "Meine Grows" }).first().click();
  await page.getByRole("button", { name: /Abgeschlossen \(1\)/ }).click();
  await expect(page.getByTestId("grow-strain").first()).toContainText("Gorilla Glue und 1 weitere");
});
