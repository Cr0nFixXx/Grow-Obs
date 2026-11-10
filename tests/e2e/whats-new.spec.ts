import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openSettings, register, uniqueEmail } from "./helpers";

/** Texte der Einträge direkt aus der Datenquelle (keine festen Titel im Test). */
const changes = JSON.parse(readFileSync("src/data/whats-new.json", "utf8")) as { id: string; title: string; date: string }[];

/** B-95/B-102: „Was ist neu“ zeigt nur Neues – einmal nach dem Update, danach (manuell) genau das zuletzt Gezeigte. */
test("Was ist neu: nur Neues, einmalig; manuell nur das zuletzt Gezeigte; nie die ganze Historie", async ({ page }) => {
  test.setTimeout(120_000);
  // Frische Installation: kein Fenster
  await register(page, "wn_fresh", uniqueEmail("wn_fresh"));
  await expect(page.getByTestId("whats-new-entry")).toHaveCount(0);

  // Bestandsinstallation ohne gemerkten Stand: nur der neueste Eintrag, mit richtigem Datum
  await page.evaluate(() => { localStorage.removeItem("go-whats-new-seen"); localStorage.removeItem("go-whats-new-last"); localStorage.setItem("go-releases-seen-at", new Date().toISOString()); });
  await page.reload();
  const sheet = page.getByTestId("whats-new-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByTestId("whats-new-entry")).toHaveCount(1);
  await expect(sheet.getByText(changes[0]!.title)).toBeVisible();
  const [y, m, d] = changes[0]!.date.split("-").map(Number);
  await expect(sheet.getByText(`${d}.${m}.${y}`)).toBeVisible();
  await expect(sheet.getByTestId("changelog-link")).toHaveAttribute("href", /docs\/CHANGELOG\.md$/);
  await sheet.getByRole("button", { name: "Verstanden" }).click();
  await expect(sheet).toHaveCount(0);

  // Kein zweites Mal
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("whats-new-sheet")).toHaveCount(0);

  // Manuell: genau das zuletzt Gezeigte (ein Eintrag)
  await openSettings(page);
  await page.getByTestId("open-whats-new").click();
  const manual = page.getByTestId("whats-new-sheet");
  await expect(manual.getByTestId("whats-new-entry")).toHaveCount(1);
  await expect(manual.getByText(changes[0]!.title)).toBeVisible();
  await manual.getByRole("button", { name: "Verstanden" }).click();

  // Mehrere Updates verpasst: höchstens drei, der Rest steht im Changelog; manuell danach dieselben drei
  await page.evaluate((id) => { localStorage.setItem("go-whats-new-seen", JSON.stringify(id)); }, changes[4]!.id);
  await page.reload();
  const auto = page.getByTestId("whats-new-sheet");
  await expect(auto).toBeVisible({ timeout: 20_000 });
  await expect(auto.getByTestId("whats-new-entry")).toHaveCount(3);
  await expect(auto.getByText("… und 1 weitere Änderung im Changelog.")).toBeVisible();
  await auto.getByRole("button", { name: "Verstanden" }).click();
  await expect(auto).toHaveCount(0);
  await openSettings(page);
  await page.getByTestId("open-whats-new").click();
  const again = page.getByTestId("whats-new-sheet");
  await expect(again.getByTestId("whats-new-entry")).toHaveCount(3);
  await expect(again.getByText(changes[3]!.title, { exact: true })).toHaveCount(0);
});
