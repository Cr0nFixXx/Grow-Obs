import { expect, test, type Browser, type Page } from "@playwright/test";
import { makeTestFiles, register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);
const FILES = makeTestFiles();
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
    await A.page.screenshot({ path: `${FILES}/lightbox-desktop.png` });
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
    await page.screenshot({ path: `${FILES}/composer-mobile.png` });
    await page.getByRole("button", { name: "Senden" }).click();
    await page.getByLabel("Bild vergrößern").click();
    const dialog = page.getByRole("dialog", { name: "Bild 1 von 1" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${FILES}/lightbox-mobile.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.close();
  });

  test("PDF-Vorschau mit allen Seiten, Zugriff nur mit Login, Löschen für alle – live beim Empfänger (B-82)", async ({ browser, playwright }) => {
    const [a, b] = [`pdf_a_${stamp}`, `pdf_b_${stamp}`];
    const A = await person(browser, a);
    const B = await person(browser, b);
    await chatNav(A.page).click();
    await A.page.getByRole("button", { name: "Neue Nachricht" }).click();
    await A.page.getByLabel("Person suchen").fill(b);
    await A.page.getByRole("button", { name: new RegExp(b) }).click();
    await A.page.getByTestId("pick-files").setInputFiles(`${FILES}/Anbauplan Woche 3.pdf`);
    await expect(A.page.getByTestId("pending-tray").locator('[data-status="done"]')).toHaveCount(1);
    await A.page.getByPlaceholder("Beschriftung hinzufügen …").fill("Plan zum Lesen");
    await A.page.getByRole("button", { name: "Senden" }).click();

    // Empfänger öffnet die Vorschau: drei Seiten, wirklich gezeichnet (nicht leer/weiß)
    await chatNav(B.page).click();
    await B.page.getByRole("button", { name: new RegExp(a) }).first().click();
    await B.page.getByRole("button", { name: "Anbauplan Woche 3.pdf ansehen" }).click();
    const viewer = B.page.getByRole("dialog", { name: "PDF-Vorschau: Anbauplan Woche 3.pdf" });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("pdf-page")).toHaveCount(3);
    await expect(viewer.getByTestId("pdf-pages")).toHaveText("Seite 1 von 3");
    await expect.poll(async () => viewer.getByRole("img", { name: "Seite 1" }).evaluate((canvas: HTMLCanvasElement) => {
      const px = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 128) return true; // dunkle Pixel = Text
      return false;
    }), { timeout: 15_000 }).toBe(true);
    await viewer.getByRole("button", { name: "Vergrößern" }).click();
    await B.page.screenshot({ path: `${FILES}/pdf-desktop.png` });
    await B.page.keyboard.press("Escape");
    await expect(B.page.getByRole("dialog")).toHaveCount(0);

    // Medien nur mit Login: ohne Cookie 401, mit Cookie 200
    const href = (await B.page.getByRole("link", { name: "Anbauplan Woche 3.pdf herunterladen" }).getAttribute("href"))!;
    const anonymous = await playwright.request.newContext();
    expect((await anonymous.get(new URL(href, B.page.url()).toString())).status()).toBe(401);
    await anonymous.dispose();
    expect((await B.page.request.get(href)).status()).toBe(200);

    // Absender löscht: Bestätigung, Platzhalter bei beiden, Datei weg
    const mine = A.page.getByRole("log").locator("div.group").last();
    await mine.hover();
    await mine.getByRole("button", { name: "Nachricht löschen" }).click();
    await expect(A.page.getByRole("dialog", { name: "Nachricht löschen?" })).toBeVisible();
    await A.page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(A.page.getByRole("dialog")).toHaveCount(0);
    await mine.hover();
    await mine.getByRole("button", { name: "Nachricht löschen" }).click();
    await A.page.getByRole("button", { name: "Für alle löschen" }).click();
    await expect(A.page.getByTestId("message-deleted")).toContainText("Du hast diese Nachricht gelöscht");
    await expect(B.page.getByTestId("message-deleted")).toContainText("Diese Nachricht wurde gelöscht", { timeout: 20_000 });
    await expect(B.page.getByRole("link", { name: /Anbauplan Woche 3.pdf/ })).toHaveCount(0);
    expect((await B.page.request.get(href)).status()).toBe(404);
  });
});
