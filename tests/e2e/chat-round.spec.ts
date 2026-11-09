import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);
const chatNav = (page: Page) => page.getByRole("button", { name: /^Chat/ }).first();

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  return { page, context };
}
const longPress = async (page: Page, text: string) => {
  const bubble = page.getByTestId("chat-message").filter({ hasText: text }).first();
  await bubble.scrollIntoViewIfNeeded();
  const box = (await bubble.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
};

/** B-94: Auswahl per langem Druck, Antworten mit Zitat, Mehrfach-Löschen, Name → Profil. */
test("Chat: lang drücken wählt aus, Antwort mit Zitat, mehrere eigene Nachrichten löschen, Kopf → Profil", async ({ browser }) => {
  test.setTimeout(150_000);
  const [a, b] = [`sel_a_${stamp}`, `sel_b_${stamp}`];
  const A = await person(browser, a);
  const B = await person(browser, b);

  await chatNav(A.page).click();
  await A.page.getByRole("button", { name: "Neue Nachricht" }).click();
  await A.page.getByLabel("Person suchen").fill(b);
  await A.page.getByRole("button", { name: new RegExp(b) }).click();
  for (const text of [`Eins ${stamp}`, `Zwei ${stamp}`]) {
    await A.page.getByPlaceholder("Nachricht schreiben…").fill(text);
    await A.page.getByRole("button", { name: "Senden" }).click();
    await expect(A.page.getByTestId("chat-message").filter({ hasText: text })).toHaveCount(1);
  }

  await chatNav(B.page).click();
  await B.page.getByRole("button", { name: new RegExp(a) }).first().click();
  await expect(B.page.getByTestId("chat-message")).toHaveCount(2);

  // B: langer Druck → Auswahl; fremde Nachricht lässt sich nicht löschen, aber beantworten und kopieren
  await longPress(B.page, `Eins ${stamp}`);
  await expect(B.page.getByTestId("selection-bar")).toContainText("1 ausgewählt");
  await expect(B.page.getByTestId("selection-delete")).toHaveCount(0);
  await expect(B.page.getByTestId("selection-copy")).toBeVisible();
  await B.page.getByTestId("selection-reply").click();
  await expect(B.page.getByTestId("reply-preview")).toContainText(`Eins ${stamp}`);
  await B.page.getByPlaceholder("Nachricht schreiben…").fill(`Antwort ${stamp}`);
  await B.page.getByRole("button", { name: "Senden" }).click();
  await expect(B.page.getByTestId("reply-preview")).toHaveCount(0);
  const reply = B.page.getByTestId("chat-message").filter({ hasText: `Antwort ${stamp}` });
  await expect(reply.getByTestId("reply-quote")).toContainText(`Eins ${stamp}`);

  // A sieht die Antwort mit Zitat (live) und beantwortet per Hover-Knopf
  const seen = A.page.getByTestId("chat-message").filter({ hasText: `Antwort ${stamp}` });
  await expect(seen.getByTestId("reply-quote")).toContainText(`Du`);

  // Abbrechen per Esc
  await longPress(B.page, `Zwei ${stamp}`);
  await expect(B.page.getByTestId("selection-bar")).toBeVisible();
  await B.page.keyboard.press("Escape");
  await expect(B.page.getByTestId("selection-bar")).toHaveCount(0);

  // A wählt zwei eigene Nachrichten (lang drücken + antippen) und löscht beide
  await longPress(A.page, `Eins ${stamp}`);
  await A.page.getByTestId("chat-message").filter({ hasText: `Zwei ${stamp}` }).first().click();
  await expect(A.page.getByTestId("selection-bar")).toContainText("2 ausgewählt");
  await A.page.getByTestId("selection-delete").click();
  await expect(A.page.getByRole("heading", { name: "2 Nachrichten löschen?" })).toBeVisible();
  await A.page.getByRole("button", { name: "Für alle löschen" }).click();
  await expect(A.page.getByTestId("message-deleted")).toHaveCount(2);
  await expect(A.page.getByTestId("selection-bar")).toHaveCount(0);
  // Das Zitat zeigt danach keinen Text mehr
  await expect(A.page.getByTestId("reply-quote")).toContainText("Nachricht gelöscht");

  // Kopf: Name führt zum Profil
  await B.page.getByTestId("header-name").click();
  await expect(B.page.getByRole("heading", { level: 1, name: a })).toBeVisible();

  await A.context.close();
  await B.context.close();
});
