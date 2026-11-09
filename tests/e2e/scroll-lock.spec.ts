import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** B-96: Overlay schließen darf die Seite nicht kurz nach oben und wieder nach unten springen lassen (html { scroll-behavior: smooth }). */
test("Overlay öffnen/schließen: Scrollposition bleibt, kein Sprung nach oben", async ({ page }) => {
  await register(page, "scroll_tester", uniqueEmail("scroll"));
  await page.getByRole("button", { name: /^Chat/ }).first().click();
  await expect(page.getByRole("button", { name: "Neue Nachricht" })).toBeVisible();

  // Seite künstlich lang machen und nach unten scrollen
  await page.evaluate(() => {
    const filler = document.createElement("div");
    filler.id = "scroll-filler";
    filler.style.height = "3000px";
    document.body.appendChild(filler);
    window.scrollTo({ top: 700, behavior: "instant" as ScrollBehavior });
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);

  await page.getByRole("button", { name: "Neue Nachricht" }).evaluate((el) => (el as HTMLElement).click()); // Playwright-Klick würde die Seite erst nach oben scrollen
  await expect(page.getByLabel("Person suchen")).toBeVisible();
  const locked = await page.evaluate(() => document.body.dataset.scrollLock);
  expect(locked).toBe("true");

  // Beim Schließen jeden Frame die Position mitschreiben
  await page.evaluate(() => {
    const w = window as unknown as { __ys: number[] };
    w.__ys = [];
    const tick = () => { if (!document.body.dataset.scrollLock) w.__ys.push(window.scrollY); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Person suchen")).toHaveCount(0);
  await page.waitForTimeout(1200);

  const ys = await page.evaluate(() => (window as unknown as { __ys: number[] }).__ys);
  expect(ys.length).toBeGreaterThan(10);
  expect(Math.min(...ys)).toBeGreaterThan(650); // nie in Richtung 0 gesprungen
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(650);
});
