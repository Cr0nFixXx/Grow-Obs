import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  return { page, context };
}
const handleOf = async (page: Page) => (await (await page.request.get("/api/auth/me")).json()).handle as string;

/** B-97: Textstatus und 24h-Status setzen, bei anderen sehen, per „Antworten“ im Direktchat zitieren. */
test("Status setzen, im fremden Profil sehen und auf den 24h-Status antworten", async ({ browser }) => {
  test.setTimeout(150_000);
  const owner = await person(browser, `sta_${stamp}`);
  const viewer = await person(browser, `vie_${stamp}`);

  await owner.page.goto("/profile");
  const editor = owner.page.getByTestId("status-editor");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "🌱" }).click();
  await owner.page.getByTestId("status-text").fill(`Woche 3 Blüte ${stamp}`);
  await owner.page.getByTestId("status-save").click();
  await expect(owner.page.getByTestId("status-line").first()).toContainText(`Woche 3 Blüte ${stamp}`);

  await owner.page.getByTestId("live-input").fill(`Heute Topping ${stamp}`);
  await owner.page.getByTestId("live-publish").click();
  await expect(owner.page.getByTestId("live-status")).toContainText(`Heute Topping ${stamp}`);
  await expect(owner.page.getByTestId("live-remaining")).toContainText(/noch (23 Std\. \d+ Min\.|24 Std\.)/);

  // Betrachter: Statuszeile und 24h-Karte im Profil
  const handle = await handleOf(owner.page);
  await viewer.page.goto(`/u/${handle}`);
  await expect(viewer.page.getByTestId("status-line").first()).toContainText(`Woche 3 Blüte ${stamp}`);
  await expect(viewer.page.getByTestId("live-text")).toContainText(`Heute Topping ${stamp}`);

  // Antworten → Direktchat mit Zitat
  await viewer.page.getByTestId("live-reply").click();
  await expect(viewer.page.getByTestId("status-reply-quote")).toContainText(`Heute Topping ${stamp}`);
  await viewer.page.getByLabel("Deine Antwort").fill("Sieht klasse aus!");
  await viewer.page.getByTestId("status-reply-send").click();
  await expect(viewer.page.getByTestId("status-quote")).toContainText(`Heute Topping ${stamp}`);
  await expect(viewer.page.getByTestId("chat-message").filter({ hasText: "Sieht klasse aus!" })).toBeVisible();

  // Der Besitzer sieht die Antwort samt Zitat, im Chat-Kopf steht der Status des Betrachters nicht (keiner gesetzt)
  await owner.page.goto("/chat");
  await owner.page.getByRole("button", { name: new RegExp(`vie_${stamp}`, "i") }).first().click();
  await expect(owner.page.getByTestId("status-quote")).toContainText(`Heute Topping ${stamp}`);

  // Betrachter: Status des Besitzers im Chat-Kopf und Chip in der Liste
  await expect(viewer.page.getByTestId("live-chip").first()).toBeVisible();
  await expect(viewer.page.getByTestId("status-line").first()).toContainText(`Woche 3 Blüte ${stamp}`);

  // Sichtbarkeit „Niemand“: der Betrachter sieht nichts mehr
  await owner.page.goto("/profile");
  await owner.page.getByTestId("status-editor").getByRole("button", { name: "Niemand" }).first().click();
  await owner.page.getByTestId("status-save").click();
  await expect(owner.page.getByText("Status gespeichert")).toBeVisible();
  await viewer.page.goto(`/u/${handle}`);
  await expect(viewer.page.getByTestId("live-text")).toBeVisible();
  await expect(viewer.page.getByTestId("status-line")).toHaveCount(0);

  // 24h-Status entfernen
  await owner.page.getByTestId("live-remove").click();
  await expect(owner.page.getByTestId("live-status")).toHaveCount(0);
  await viewer.page.goto(`/u/${handle}`);
  await expect(viewer.page.getByTestId("live-status")).toHaveCount(0);

  await owner.context.close();
  await viewer.context.close();
});
