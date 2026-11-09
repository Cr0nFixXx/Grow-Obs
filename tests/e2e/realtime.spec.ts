import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);
const chatNav = (page: Page) => page.getByRole("button", { name: /^Chat/ }).first();

async function person(browser: Browser, name: string, init?: () => void) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  return { page, context };
}

async function startChat(page: Page, withName: string) {
  await page.getByRole("button", { name: /^Chat/ }).first().click();
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  await page.getByLabel("Person suchen").fill(withName);
  await page.getByRole("button", { name: new RegExp(withName) }).first().click();
  await expect(page.getByRole("log", { name: "Chat-Verlauf" })).toBeVisible();
}

test.describe("Chat & Echtzeit (B-59)", () => {
  test("Nachricht, Badge, gelesen, „schreibt …“ und Online-Status laufen live über WebSocket", async ({ browser }) => {
    const [a, b] = [`live_a_${stamp}`, `live_b_${stamp}`];
    const A = await person(browser, a);
    const B = await person(browser, b);

    await startChat(A.page, b);
    await expect(A.page.getByTestId("live-status")).toHaveAttribute("data-live", "ws");
    await expect(A.page.getByTestId("chat-status")).toHaveText("Online"); // B ist verbunden → Gegenüber online

    await A.page.getByPlaceholder("Nachricht schreiben…").fill("Hallo live");
    await A.page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(A.page.getByRole("log").getByText("Hallo live")).toBeVisible();

    // B ist auf dem Dashboard: Badge am Chat-Eintrag erscheint ohne Reload
    await expect(chatNav(B.page)).toHaveText(/Chat\s*1/);
    await chatNav(B.page).click();
    await expect(B.page.getByTestId("live-status")).toHaveAttribute("data-live", "ws");
    await B.page.getByRole("button", { name: new RegExp(a) }).first().click();
    await expect(B.page.getByRole("log").getByText("Hallo live")).toBeVisible();
    await expect(chatNav(B.page)).not.toHaveText(/Chat\s*\d/); // gelesen → Badge weg

    // B tippt → A sieht „schreibt …“; B sendet → A sieht die Antwort live
    await B.page.getByPlaceholder("Nachricht schreiben…").pressSequentially("Antwo");
    await expect(A.page.getByTestId("chat-status")).toHaveText("schreibt …");
    await B.page.getByPlaceholder("Nachricht schreiben…").fill("Antwort von B");
    await B.page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(A.page.getByRole("log").getByText("Antwort von B")).toBeVisible();
    await expect(A.page.getByTestId("chat-status")).toHaveText("Online");

    // B geht offline → A sieht es (nach der kurzen Karenz)
    await B.context.close();
    await expect(A.page.getByTestId("chat-status")).toHaveText("Offline", { timeout: 20_000 });
    await A.context.close();
  });

  test("Rückfall auf SSE: ohne WebSocket kommen Nachrichten trotzdem live", async ({ browser }) => {
    const noWs = () => { Object.defineProperty(window, "WebSocket", { value: undefined, configurable: true }); };
    const [a, b] = [`sse_a_${stamp}`, `sse_b_${stamp}`];
    const A = await person(browser, a, noWs);
    const B = await person(browser, b, noWs);

    await startChat(A.page, b);
    await expect(A.page.getByTestId("live-status")).toHaveAttribute("data-live", "sse");
    await A.page.getByPlaceholder("Nachricht schreiben…").fill("Per SSE");
    await A.page.getByRole("button", { name: "Senden", exact: true }).click();

    await expect(chatNav(B.page)).toHaveText(/Chat\s*1/);
    await chatNav(B.page).click();
    await expect(B.page.getByTestId("live-status")).toHaveAttribute("data-live", "sse");
    await B.page.getByRole("button", { name: new RegExp(a) }).first().click();
    await expect(B.page.getByRole("log").getByText("Per SSE")).toBeVisible();

    await B.page.getByPlaceholder("Nachricht schreiben…").pressSequentially("tipp");
    await expect(A.page.getByTestId("chat-status")).toHaveText("schreibt …"); // „schreibt …“ über POST /realtime/command
    await A.context.close();
    await B.context.close();
  });

  test("Forum: neue Kommentare erscheinen live im offenen Thread, der Autor bekommt die Glocke ohne Reload", async ({ browser }) => {
    const A = await person(browser, `forum_a_${stamp}`);
    const B = await person(browser, `forum_b_${stamp}`);
    const created = await B.page.request.post("/api/forum/threads", { data: { title: `Live-Thread ${stamp}`, sub: "r/GrowTagebuch", text: "Wer ist wach?" } });
    expect(created.status()).toBe(201);
    const thread = await created.json() as { id: string };

    await B.page.goto(`/forum/${thread.id}`);
    await expect(B.page.getByText("Wer ist wach?")).toBeVisible();
    await A.page.goto(`/forum/${thread.id}`);
    await expect(A.page.getByText("Wer ist wach?")).toBeVisible();

    const res = await A.page.request.post(`/api/forum/threads/${thread.id}/comments`, { data: { text: `Ich bin da ${stamp}` } });
    expect(res.status()).toBe(201);
    await expect(B.page.getByText(`Ich bin da ${stamp}`)).toBeVisible(); // ohne Reload
    await expect(B.page.getByRole("button", { name: /Benachrichtigungen, 1 ungelesen/ })).toBeVisible();
    await A.context.close();
    await B.context.close();
  });
});
