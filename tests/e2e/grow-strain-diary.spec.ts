import { expect, test } from "@playwright/test";
import { makeTestFiles, register, uniqueEmail } from "./helpers";

/** B-101: Tagebuch-Einträge, Fotos und pH/EC je Sorte wählbar; Temperatur/Luftfeuchte gelten für den ganzen Grow. */
test("Grow mit zwei Sorten: Einträge, Fotos und pH/EC je Sorte, Sorten-Filter, Sorte entfernen", async ({ page }) => {
  test.setTimeout(150_000);
  await register(page, "Sorten Tagebuch", uniqueEmail("sdiary"));
  const name = `Sortenbuch ${Date.now().toString(36)}`;

  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await page.getByPlaceholder("z. B. Gorilla Glue #4").fill("Alpha");
  await page.getByTestId("strain-add").click();
  await page.getByLabel("Sorte 2", { exact: true }).fill("Beta");
  await page.getByRole("button", { name: "Grow anlegen" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const main = page.locator("#app-main");

  // Eintrag nur für Beta, Eintrag für den ganzen Grow
  await page.getByRole("button", { name: /^\+ Eintrag$/ }).click();
  await page.getByPlaceholder(/Komposttee/).fill("Nur Beta düngen");
  await page.getByTestId("strain-pick").filter({ hasText: "Beta" }).click();
  await page.getByRole("button", { name: "Eintrag speichern" }).click();
  await expect(main.getByText("Nur Beta düngen")).toBeVisible();
  await page.getByRole("button", { name: /^\+ Eintrag$/ }).click();
  await page.getByPlaceholder(/Komposttee/).fill("Alle gießen");
  await expect(page.getByTestId("strain-pick-all")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Eintrag speichern" }).click();
  await expect(main.getByText("Alle gießen")).toBeVisible();
  const betaLog = main.locator("div.flex-1.pb-4").filter({ hasText: "Nur Beta düngen" });
  await expect(betaLog.getByTestId("strain-tags")).toContainText("Beta");
  await expect(main.locator("div.flex-1.pb-4").filter({ hasText: "Alle gießen" }).getByTestId("strain-tags")).toHaveCount(0);

  // Messwerte: Temp/RLF ganzer Grow, pH/EC je Sorte
  await page.getByTestId("add-env").click();
  const env = page.getByTestId("env-form");
  await env.getByLabel("Temperatur").fill("24");
  await env.getByLabel("Luftfeuchte").fill("55");
  await env.getByLabel("pH Alpha").fill("6,1");
  await env.getByLabel("EC Alpha").fill("1,2");
  await env.getByLabel("pH Beta").fill("5,9");
  await env.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("env-row")).toHaveCount(1);
  await expect(page.getByTestId("env-strain-line")).toHaveCount(2);
  await expect(page.getByTestId("env-strain-line").first()).toContainText("Alpha");
  await expect(page.getByTestId("chart-ph")).toBeVisible();
  await expect(page.getByTestId("chart-ec")).toBeVisible();
  await expect(page.getByTestId("chart-climate")).toBeVisible();

  // Messwerte bearbeiten: Werte sind vorbelegt
  await page.getByRole("button", { name: /Messwerte vom .* bearbeiten/ }).click();
  await expect(page.getByLabel("pH Beta")).toHaveValue("5,9");
  await expect(page.getByLabel("EC Beta")).toHaveValue("");
  await page.getByRole("button", { name: "Abbrechen" }).click();

  // Foto bei „Alle“: Dialog fragt nach der Sorte
  const files = makeTestFiles();
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/gruen.png`);
  const dialog = page.getByTestId("photo-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("strain-pick").filter({ hasText: "Alpha" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
  await expect(page.getByTestId("grow-photo").getByTestId("strain-tags")).toContainText("Alpha");

  // Filter: Beta zeigt Beta-Eintrag, Gesamt-Eintrag, kein Alpha-Foto; Alpha umgekehrt
  const filter = page.getByTestId("strain-filter");
  await filter.getByTestId("strain-filter-chip").filter({ hasText: "Beta" }).click();
  await expect(page.getByTestId("strain-filter-hint")).toBeVisible();
  await expect(main.getByText("Nur Beta düngen")).toBeVisible();
  await expect(main.getByText("Alle gießen")).toBeVisible();
  await expect(page.getByTestId("grow-photo")).toHaveCount(0);
  await expect(main.getByText("Keine Fotos für diese Sorte.")).toBeVisible();
  await expect(page.getByTestId("env-strain-line")).toHaveCount(1);
  await expect(page.getByTestId("env-strain-line")).toContainText("Beta");
  // Mit gewählter Sorte gehört ein neues Foto zu ihr (kein Dialog)
  await page.locator('input[type="file"]').first().setInputFiles(`${files}/braun.png`);
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
  await expect(page.getByTestId("grow-photo").getByTestId("strain-tags")).toContainText("Beta");
  await expect(page.getByTestId("photo-dialog")).toHaveCount(0);
  await filter.getByTestId("strain-filter-chip").filter({ hasText: "Alpha" }).click();
  await expect(main.getByText("Nur Beta düngen")).toHaveCount(0);
  await expect(main.getByText("Alle gießen")).toBeVisible();
  await expect(page.getByTestId("grow-photo")).toHaveCount(1);
  await filter.getByTestId("strain-filter-all").click();
  await expect(page.getByTestId("grow-photo")).toHaveCount(2);

  // Eintrag nachträglich zuordnen
  await page.getByTestId("edit-log").first().click();
  await page.getByTestId("edit-log-form").getByTestId("strain-pick").filter({ hasText: "Alpha" }).click();
  await page.getByTestId("edit-log-form").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("edit-log-form")).toHaveCount(0);
  await expect(main.getByTestId("strain-tags").filter({ hasText: "Alpha" })).not.toHaveCount(0);

  // Sorte Beta entfernen: Zuordnungen lösen sich, pH wandert in den Tageswert
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await page.getByTestId("edit-grow-form").getByLabel("Sorte 2 entfernen").click();
  await page.getByTestId("edit-grow-form").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("grow-strains")).toHaveCount(0); // nur noch eine Sorte
  await expect(page.getByTestId("strain-filter")).toHaveCount(0);
  await expect(main.getByText("Nur Beta düngen")).toBeVisible();
  await expect(page.getByTestId("grow-photo")).toHaveCount(2);
  await expect(page.getByTestId("chart-feed")).toBeVisible(); // wieder das gemeinsame pH/EC-Diagramm
});
