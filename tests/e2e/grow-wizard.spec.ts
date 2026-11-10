import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** B-102: „Neuer Grow“ als Wizard – mobil bedienbar, Schritte, Übersicht, Sichtbarkeit, Abbrechen. */
test("Neuer Grow als Wizard (mobil): vier Schritte, Auswahlkacheln, Übersicht, Sichtbarkeit, Abbrechen", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page, "Wizard Tester", uniqueEmail("wizard"));
  await page.setViewportSize({ width: 390, height: 844 });
  const name = `Wizard ${Date.now().toString(36)}`;

  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  const wizard = page.getByTestId("grow-wizard");
  await expect(wizard.getByTestId("wizard-progress")).toHaveText("Neuer Grow · Schritt 1 von 4");
  await expect(page.getByRole("button", { name: "Schnellaktion" })).toHaveCount(0);

  // Schritt 1: ohne Namen kein Weiter; Sorte ist freiwillig
  const next = page.getByRole("button", { name: /^Weiter/ });
  await expect(next).toBeDisabled();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill(name);
  await expect(next).toBeEnabled();
  await page.getByLabel("Sorte 1", { exact: true }).fill("Gorilla Glue");
  await page.screenshot({ path: "/tmp/w1.png" });
  await next.click();

  // Schritt 2: Kacheln für Medium und Typ
  await expect(wizard.getByTestId("wizard-progress")).toHaveText("Neuer Grow · Schritt 2 von 4");
  await wizard.getByRole("radio", { name: /Kokos/ }).click();
  await wizard.getByRole("radio", { name: /Indica/ }).click();
  await expect(wizard.getByRole("radio", { name: /Kokos/ })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "/tmp/w2.png" });
  await next.click();

  // Schritt 3: Schnellwahl, Vorschau, Sichtbarkeit
  await wizard.getByRole("button", { name: "Vor 1 Woche" }).click();
  await expect(wizard.getByTestId("wizard-start-preview")).toContainText("Tag 7");
  await wizard.getByRole("radio", { name: /Öffentlich/ }).click();
  await page.screenshot({ path: "/tmp/w3.png" });
  await next.click();

  // Schritt 4: Übersicht, „Ändern“ springt zurück und behält alles
  const review = wizard.getByTestId("wizard-review");
  await expect(review).toContainText(name);
  await expect(review).toContainText("Gorilla Glue");
  await expect(review).toContainText("Kokos/Perlit 70/30");
  await expect(review).toContainText("Indica");
  await expect(review).toContainText("Öffentlich");
  await page.screenshot({ path: "/tmp/w4.png" });
  await review.getByRole("button", { name: "Typ ändern" }).click();
  await expect(wizard.getByRole("radio", { name: /Indica/ })).toHaveAttribute("aria-checked", "true");
  await next.click();
  await next.click();
  await page.getByRole("button", { name: "Grow anlegen" }).click();

  // Detail: Typ, Medium, Tag 7 und Sichtbarkeit sind übernommen
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Kokos/Perlit 70/30").first()).toBeVisible();
  await expect(page.getByText(/^(6|7|8)\/84$/)).toBeVisible();
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await expect(page.getByTestId("grow-visibility")).toHaveValue("public");
  await page.keyboard.press("Escape");
});

test("Neuer Grow ohne Sorte; Abbrechen fragt nur bei Eingaben nach", async ({ page }) => {
  await register(page, "Wizard Zwei", uniqueEmail("wizard2"));
  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  // leer: sofort zurück
  await page.getByTestId("wizard-cancel").click();
  await expect(page.getByTestId("grow-wizard")).toHaveCount(0);

  await page.getByRole("button", { name: "Neuer Grow" }).first().click();
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").fill("Nur ein Name");
  await page.getByTestId("wizard-cancel").click();
  await expect(page.getByText("Eingaben verwerfen?")).toBeVisible();
  await page.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByText("Eingaben verwerfen?")).toBeHidden();
  await expect(page.getByPlaceholder("z. B. Northern Haze · Run 04")).toHaveValue("Nur ein Name");

  // Enter im Namensfeld geht zum nächsten Schritt; ohne Sorte anlegen
  await page.getByPlaceholder("z. B. Northern Haze · Run 04").press("Enter");
  await expect(page.getByTestId("wizard-progress")).toHaveText("Neuer Grow · Schritt 2 von 4");
  await page.getByRole("button", { name: /^Weiter/ }).click();
  await page.getByRole("button", { name: /^Weiter/ }).click();
  await expect(page.getByTestId("wizard-review")).toContainText("Keine Sorte angegeben");
  await page.getByRole("button", { name: "Grow anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Nur ein Name" })).toBeVisible();
});
