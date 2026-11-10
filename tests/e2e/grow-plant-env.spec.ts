import { expect, test } from "@playwright/test";
import { createGrow, register, uniqueEmail } from "./helpers";

/** B-104: pH/EC je Pflanze; „Ganzer Grow“ gilt für alle Pflanzen (kein eigenes Diagramm/keine eigene Linie mehr). */
test("Eine Sorte mit drei Pflanzen: Grundwert für alle, eigene Werte je Pflanze, Anzeige und Bearbeiten", async ({ page }) => {
  test.setTimeout(150_000);
  await register(page, "Pflanzen Env", uniqueEmail("plantenv"));
  const name = `Pflanzen ${Date.now().toString(36)}`;

  // Sorte mit 3 Pflanzen über die Sortenkarte im Wizard
  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await page.getByLabel("Sorte 1", { exact: true }).fill("Alpha");
  await page.getByLabel("Pflanzen von Sorte 1").fill("3");
  await page.getByRole("button", { name: /^Weiter/ }).click();
  await page.getByRole("button", { name: /^Weiter/ }).click();
  await page.getByRole("button", { name: /^Weiter/ }).click();
  await page.getByRole("button", { name: "Grow anlegen" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Messwerte: Grundwert für den ganzen Grow, dazu eigene Werte für einzelne Pflanzen
  await page.getByTestId("add-env").click();
  const env = page.getByTestId("env-form");
  await expect(env.getByTestId("plants-toggle")).toBeVisible();
  await expect(env.getByTestId("plant-env-row")).toHaveCount(0); // eingeklappt
  await env.getByLabel("pH", { exact: true }).fill("6,0");
  await env.getByLabel("EC", { exact: true }).fill("1,2");
  await env.getByTestId("plants-toggle").click();
  await expect(env.getByTestId("plant-env-row")).toHaveCount(3);
  await env.getByLabel("pH Alpha Pflanze 2").fill("5,6");
  await env.getByLabel("EC Alpha Pflanze 3").fill("1,9");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);

  // Liste: Grow-Zeile plus je eine Zeile für die Pflanzen mit eigenen Werten
  await expect(page.getByTestId("env-strain-line")).toHaveCount(2);
  await expect(page.getByTestId("env-strain-line").first()).toContainText("Pflanze 2");
  await expect(page.getByTestId("env-strain-line").nth(1)).toContainText("Pflanze 3");
  await expect(page.getByTestId("chart-ph")).toBeVisible();
  await expect(page.getByTestId("chart-ec")).toBeVisible();
  await expect(page.getByTestId("chart-feed")).toHaveCount(0); // kein separates Grow-Diagramm mehr

  // Bearbeiten: Pflanzenwerte sind vorbelegt, Pflanzenliste ist offen
  await page.getByRole("button", { name: /Messwerte vom .* bearbeiten/ }).click();
  await expect(page.getByLabel("pH Alpha Pflanze 2")).toHaveValue("5,6");
  await expect(page.getByLabel("EC Alpha Pflanze 3")).toHaveValue("1,9");
  await expect(page.getByLabel("pH Alpha Pflanze 1")).toHaveValue("");
  // Pflanze 2 leeren → fällt auf den Grundwert zurück, Zeile verschwindet
  await page.getByLabel("pH Alpha Pflanze 2").fill("");
  await page.getByTestId("env-form").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-strain-line")).toHaveCount(1);
  await expect(page.getByTestId("env-strain-line").first()).toContainText("Pflanze 3");
});
