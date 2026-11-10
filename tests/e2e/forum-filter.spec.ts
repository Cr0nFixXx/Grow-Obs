import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);

/** B-93: Forum-Filter (Suche, Ohne Antworten, Nur meine) und Kommentar-Sortierung. */
test("Forum: Suche und Filter grenzen die Liste ein, Kommentare lassen sich sortieren", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await register(page, `forum_${stamp}`, uniqueEmail("forumfilter"));
  const subs = (await (await page.request.get("/api/forum/subs")).json()) as string[];
  const mk = async (title: string, ctx = page) => {
    const res = await ctx.request.post("/api/forum/threads", { data: { title, sub: subs[0], text: `Text zu ${title}` } });
    expect(res.status()).toBe(201);
    return (await res.json()).id as string;
  };
  const ownId = await mk(`Eigener Thread ${stamp}`);
  const answered = await mk(`Beantwortet ${stamp}`);
  for (const text of ["Erster Kommentar", "Zweiter Kommentar"]) {
    expect((await page.request.post(`/api/forum/threads/${answered}/comments`, { data: { text } })).status()).toBe(201);
  }

  const other = await browser.newContext();
  const op = await other.newPage();
  await register(op, `fremd_${stamp}`, uniqueEmail("forumother"));
  await mk(`Fremder Thread ${stamp}`, op);

  await page.getByRole("button", { name: "Forum" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
  await expect(page.getByText(`Eigener Thread ${stamp}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Fremder Thread ${stamp}`, { exact: true })).toBeVisible();

  await page.getByTestId("forum-search").fill(`fremder thread ${stamp}`);
  await expect(page.getByTestId("forum-result-count")).toHaveText("1 Thread gefunden");
  await expect(page.getByText(`Eigener Thread ${stamp}`, { exact: true })).toHaveCount(0);

  await page.getByTestId("forum-filter-reset").click();
  await page.getByTestId("forum-search").fill(String(stamp));
  await page.getByTestId("forum-filter-toggle").click();
  await page.getByLabel("Nur meine").check();
  await expect(page.getByText(`Fremder Thread ${stamp}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText(`Beantwortet ${stamp}`, { exact: true })).toBeVisible();
  await page.getByLabel("Ohne Antworten").check();
  await expect(page.getByTestId("forum-result-count")).toHaveText("1 Thread gefunden");
  await expect(page.getByText(`Eigener Thread ${stamp}`, { exact: true })).toBeVisible();

  await page.getByTestId("forum-search").fill("gibt-es-nicht");
  await expect(page.getByText("Keine passenden Threads")).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(page.getByText(`Fremder Thread ${stamp}`, { exact: true })).toBeVisible();

  // Kommentar-Sortierung im Thread
  await page.getByText(`Beantwortet ${stamp}`, { exact: true }).click();
  await expect(page.getByTestId("forum-comment")).toHaveCount(2);
  const bodies = () => page.getByTestId("forum-comment").locator("p.whitespace-pre-line").allTextContents();
  expect(await bodies()).toEqual(["Erster Kommentar", "Zweiter Kommentar"]);
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  expect(await bodies()).toEqual(["Zweiter Kommentar", "Erster Kommentar"]);
  await page.getByRole("button", { name: "Älteste", exact: true }).click();
  expect(await bodies()).toEqual(["Erster Kommentar", "Zweiter Kommentar"]);
  void ownId;
  await other.close();
});
