import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test("Mobil (Pixel 5): Bottom-Navigation vorhanden, Menü öffnet, kein horizontaler Überlauf", async ({ page }) => {
  await register(page, "Mobile Tester", uniqueEmail("mobile"));
  for (const name of ["Home", "Grows", "Forum", "Profil", "Mehr"]) {
    await expect(page.getByRole("button", { name, exact: true }).last()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Forum", exact: true }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
});

const stamp = Date.now().toString(36).slice(-5);

/** Kein horizontaler Überlauf (sonst verkleinert/verschiebt der mobile Browser die Seite) und kein Seiten-Scroll. */
async function expectFitsScreen(page: Page, vertical = true) {
  const m = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowY: document.documentElement.scrollHeight - window.innerHeight,
    innerWidth: window.innerWidth,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
  }));
  expect(m.overflowX).toBeLessThanOrEqual(1);
  if (vertical) expect(m.overflowY).toBeLessThanOrEqual(1);
  expect(Math.abs(m.visualWidth - m.innerWidth)).toBeLessThanOrEqual(1); // Layout-Viewport nicht aufgeweitet
}

test("Mobil: Zoom und Übersetzungsangebot sind aus, der Chat füllt den Bildschirm (360 px, Hochformat und Querformat)", async ({ page, browser }) => {
  const [a, b] = [`mob_a_${stamp}`, `mob_b_${stamp}`];
  const other = await (await browser.newContext()).newPage();
  await register(other, b, uniqueEmail(b));
  await register(page, a, uniqueEmail(a));

  // Kein Pinch-Zoom, keine Übersetzungsleiste/-menü von Chrome
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /user-scalable=no/);
  await expect(page.locator('meta[name="google"]')).toHaveAttribute("content", "notranslate");
  await expect(page.locator("html")).toHaveAttribute("translate", "no");

  await page.getByRole("button", { name: "Mehr", exact: true }).last().click();
  await page.getByRole("button", { name: /^Chat/ }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Chat" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 600 });
  await expectFitsScreen(page, false); // Liste + Kopfzeile bei 360 px ohne Überlauf

  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  await page.getByLabel("Person suchen").fill(b);
  await page.getByRole("button", { name: new RegExp(b) }).click();
  const box = page.getByPlaceholder("Nachricht schreiben…");
  await expect(box).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await box.fill(`Nachricht ${i} ${"lang ".repeat(i * 4)}`);
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(box).toHaveValue("");
  }
  const screen = page.getByTestId("chat-fullscreen");
  for (const [width, height] of [[360, 600], [393, 727], [740, 360]] as const) {
    await page.setViewportSize({ width, height });
    await expect(screen).toBeVisible();
    await expectFitsScreen(page);
    const rect = await screen.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, innerHeight: window.innerHeight }; });
    expect(rect.top).toBe(0);
    expect(Math.round(rect.bottom)).toBe(rect.innerHeight);
    const composer = await box.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(composer).toBeLessThanOrEqual(rect.innerHeight); // Eingabefeld bleibt sichtbar
    await expect(page.getByRole("log", { name: "Chat-Verlauf" }).getByText(/^Nachricht 9/)).toBeVisible(); // ganz unten
  }

  // Zurück zur Liste: keine Vollbild-Ebene mehr, Seite wieder normal
  await page.setViewportSize({ width: 393, height: 727 });
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Neue Nachricht" })).toBeVisible();
  await expectFitsScreen(page, false); // die Liste darf die Seite verlängern, aber nie seitlich überlaufen
});
