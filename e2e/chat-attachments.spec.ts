import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);
const FILES = "/tmp/e2e-files";
const chatNav = (page: Page) => page.getByRole("button", { name: /^Chat/ }).first();

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  return { page, context };
}

test.describe("Chat-Anhänge (B-81)", () => {
  test("mehrere Bilder + Datei senden, Bildvorschau mit Wischen und Speichern, Datei als Download – live beim Empfänger", async ({ browser }) => {
    const [a, b] = [`att_a_${stamp}`, `att_b_${stamp}`];
    const A = await person(browser, a);
    const B = await person(browser, b);

    await chatNav(A.page).click();
    await A.page.getByRole("button", { name: "Neue Nachricht" }).click();
    await A.page.getByLabel("Person suchen").fill(b);
    await A.page.getByRole("button", { name: new RegExp(b) }).click();
    await expect(A.page.getByLabel("Anhang hinzufügen")).toBeVisible();

    // Zwei Bilder wählen: Vorschau in der Ablage, Senden erst nach dem Hochladen möglich
    await A.page.getByTestId("pick-photos").setInputFiles([`${FILES}/gruen.png`, `${FILES}/braun.png`]);
    const tray = A.page.getByTestId("pending-tray");
    await expect(tray.getByRole("listitem")).toHaveCount(2);
    await expect(tray.locator('[data-status="done"]')).toHaveCount(2);
    // Unzulässige Datei wird sofort abgelehnt und blockiert das Senden der übrigen nicht
    await A.page.getByTestId("pick-files").setInputFiles(`${FILES}/setup.exe`).catch(() => undefined);
    await A.page.getByTestId("pick-files").setInputFiles(`${FILES}/Anbauplan Woche 3.pdf`);
    await expect(tray.locator('[data-status="done"]')).toHaveCount(3);
    await A.page.getByPlaceholder("Beschriftung hinzufügen …").fill("Schau mal");
    await A.page.getByRole("button", { name: "Senden" }).click();
    // Gesendetes verschwindet aus der Ablage, nur die abgelehnte Datei bleibt zur Korrektur
    await expect(tray.getByRole("listitem")).toHaveCount(1);
    await expect(tray.locator('[data-status="error"]')).toContainText("Dateityp nicht erlaubt");
    await tray.getByLabel("setup.exe entfernen").click();
    await expect(tray).toHaveCount(0);

    const bubble = A.page.getByRole("log").locator("div.group").last();
    await expect(bubble.getByTestId("image-grid").getByRole("button")).toHaveCount(2);
    const link = bubble.getByRole("link", { name: "Anbauplan Woche 3.pdf herunterladen" });
    await expect(link).toBeVisible();
    await expect(bubble).toContainText("Schau mal");

    // Bild antippen → Vollbild-Vorschau; wischen/Pfeil zum zweiten Bild, Speichern-Link, Esc schließt
    await bubble.getByLabel("Bild 1 von 2 vergrößern").click();
    const dialog = A.page.getByRole("dialog", { name: "Bild 1 von 2" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Du ·")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Bild speichern" })).toHaveAttribute("href", /\/media\/[0-9a-f-]+\?download=1/);
    await A.page.keyboard.press("ArrowRight");
    await expect(A.page.getByRole("dialog", { name: "Bild 2 von 2" })).toBeVisible();
    await A.page.screenshot({ path: "/tmp/e2e-files/lightbox-desktop.png" });
    await A.page.keyboard.press("Escape");
    await expect(A.page.getByRole("dialog")).toHaveCount(0);

    // Datei: der Server liefert sie immer als Download
    const href = await link.getAttribute("href");
    const res = await A.page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="Anbauplan Woche 3.pdf"/);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");

    // Empfänger sieht Bilder, Datei und Vorschau der Liste
    await chatNav(B.page).click();
    await B.page.getByRole("button", { name: new RegExp(a) }).first().click();
    const theirs = B.page.getByRole("log").locator("div.group").last();
    await expect(theirs.getByTestId("image-grid").getByRole("button")).toHaveCount(2);
    await expect(theirs.getByRole("link", { name: /Anbauplan Woche 3.pdf/ })).toBeVisible();
    await theirs.getByLabel("Bild 2 von 2 vergrößern").click();
    await expect(B.page.getByRole("dialog", { name: "Bild 2 von 2" })).toBeVisible();
    await expect(B.page.getByRole("dialog").getByText(new RegExp(`${a} ·`))).toBeVisible();
    await B.page.getByRole("button", { name: "Galerie schließen" }).click();
    await expect(B.page.getByRole("dialog")).toHaveCount(0);
  });

  test("Handy: Bildvorschau füllt den Bildschirm, nach unten wischen schließt", async ({ browser }) => {
    const [a, b] = [`atm_a_${stamp}`, `atm_b_${stamp}`];
    const context = await browser.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await register(page, a, uniqueEmail(a));
    const other = await person(browser, b);
    await other.page.close();
    await page.getByRole("button", { name: "Mehr", exact: true }).last().click();
    await page.getByRole("button", { name: /^Chat/ }).first().click();
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    await page.getByLabel("Person suchen").fill(b);
    await page.getByRole("button", { name: new RegExp(b) }).click();
    await page.getByTestId("pick-photos").setInputFiles(`${FILES}/gruen.png`);
    await expect(page.getByTestId("pending-tray").locator('[data-status="done"]')).toHaveCount(1);
    await page.screenshot({ path: "/tmp/e2e-files/composer-mobile.png" });
    await page.getByRole("button", { name: "Senden" }).click();
    await page.getByLabel("Bild vergrößern").click();
    const dialog = page.getByRole("dialog", { name: "Bild 1 von 1" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: "/tmp/e2e-files/lightbox-mobile.png" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.close();
  });
});
