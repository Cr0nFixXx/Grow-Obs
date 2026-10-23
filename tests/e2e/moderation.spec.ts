import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  const me = await (await page.request.get("/api/auth/me")).json() as { id?: string; user?: { id: string } };
  return { page, context, name, id: (me.user?.id ?? me.id)! };
}
type Person = Awaited<ReturnType<typeof person>>;

/** Öffentliche Community: `owner` = Admin, `mod` = Moderator, übrige = Mitglieder. */
async function setup(browser: Browser, label: string) {
  const owner = await person(browser, `own_${label}_${stamp}`);
  const mod = await person(browser, `mod_${label}_${stamp}`);
  const alice = await person(browser, `ali_${label}_${stamp}`);
  const bob = await person(browser, `bob_${label}_${stamp}`);
  const created = await owner.page.request.post("/api/communities", { data: { name: `Soil ${label} ${stamp}`, description: "E2E", isPrivate: false } });
  expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };
  for (const p of [mod, alice, bob]) expect((await p.page.request.post(`/api/communities/${id}/join`)).status()).toBe(200);
  expect((await owner.page.request.patch(`/api/communities/${id}/members/${mod.id}/role`, { data: { role: "moderator" } })).status()).toBe(200);
  const open = async (p: Person, tab?: RegExp) => {
    await p.page.goto(`/communities/${id}`);
    await expect(p.page.getByRole("heading", { name: new RegExp(`Soil ${label}`) })).toBeVisible();
    if (tab) await p.page.getByRole("button", { name: tab }).click();
  };
  const close = () => Promise.all([owner, mod, alice, bob].map((p) => p.context.close()));
  return { owner, mod, alice, bob, id, open, close };
}

const postCard = (page: Page, text: string) => page.getByTestId("community-post").filter({ hasText: text });

test.describe("Community-Moderation (B-61)", () => {
  test("Feed, Melden, Warteschlange, Ausblenden – mit Benachrichtigung für den Autor", async ({ browser }) => {
    const { mod, alice, bob, open, close } = await setup(browser, "a");
    const text = `Kauft mein Zeug ${stamp}`;

    await open(alice);
    await alice.page.getByLabel("Beitrag schreiben").fill(text);
    await alice.page.getByRole("button", { name: /Beitrag$/ }).click();
    await expect(postCard(alice.page, text)).toBeVisible();

    // Mitglied bob sieht den Beitrag, kann melden – aber nicht ausblenden
    await open(bob);
    const bobCard = postCard(bob.page, text);
    await expect(bobCard).toBeVisible();
    await bobCard.locator('[aria-haspopup="menu"]').click();
    await expect(bob.page.getByRole("menuitem", { name: /ausblenden/i })).toHaveCount(0);
    await bob.page.getByRole("menuitem", { name: "Melden" }).click();
    await bob.page.getByLabel(/Spam oder Werbung/).check();
    await bob.page.getByRole("button", { name: "Meldung senden" }).click();
    await expect(bob.page.getByText("Danke für die Meldung")).toBeVisible();
    // alice (Autorin) sieht kein Menü an ihrem eigenen Beitrag
    await expect(postCard(alice.page, text).locator('[aria-haspopup="menu"]')).toHaveCount(0);

    // Moderator: Reiter mit Zähler, Gruppe mit Grund, Ausblenden
    await open(mod);
    await expect(mod.page.getByRole("button", { name: /^Moderation\s*1/ })).toBeVisible();
    await mod.page.getByRole("button", { name: /^Moderation/ }).click();
    const group = mod.page.getByTestId("report-group");
    await expect(group).toContainText(text);
    await expect(group).toContainText("Spam oder Werbung");
    await group.getByRole("button", { name: /Ausblenden/ }).click();
    await expect(mod.page.getByText("Keine offenen Meldungen")).toBeVisible();
    await mod.page.getByRole("button", { name: "Erledigt" }).click();
    await expect(mod.page.getByTestId("report-group")).toContainText("Ausgeblendet");

    // Mitglieder sehen den Beitrag nicht mehr; Moderation sieht ihn markiert und kann ihn einblenden
    await bob.page.reload();
    await expect(bob.page.getByLabel("Beitrag schreiben")).toBeVisible();
    await expect(postCard(bob.page, text)).toHaveCount(0);
    await mod.page.getByRole("button", { name: "Feed", exact: true }).click();
    await expect(postCard(mod.page, text)).toContainText("Ausgeblendet");

    // Autorin wurde benachrichtigt (live, ohne Reload)
    await expect(alice.page.getByRole("button", { name: /Benachrichtigungen, 1 ungelesen/ })).toBeVisible();

    // Zurückholen
    await postCard(mod.page, text).locator('[aria-haspopup="menu"]').click();
    await mod.page.getByRole("menuitem", { name: "Wieder einblenden" }).click();
    await bob.page.reload();
    await expect(postCard(bob.page, text)).toBeVisible();
    await close();
  });

  test("Außenstehende sehen den Feed nicht; Kommentare lassen sich melden und ausblenden", async ({ browser }) => {
    const { owner, mod, alice, bob, id, open, close } = await setup(browser, "c");
    const outsider = await person(browser, `out_c_${stamp}`);
    const text = `Beitrag ${stamp}`;
    const created = await alice.page.request.post("/api/social/posts", { data: { text, communityId: id } });
    expect(created.status()).toBe(201);
    const postId = (await created.json() as { id: string }).id;
    expect((await outsider.page.request.get(`/api/social/posts?communityId=${id}`)).status()).toBe(404);
    expect((await outsider.page.request.get(`/api/social/posts/${postId}/comments`)).status()).toBe(404);
    // Der globale Feed zeigt Community-Beiträge nicht
    const global = await (await outsider.page.request.get("/api/social/posts")).json() as { id: string }[];
    expect(global.some((p) => p.id === postId)).toBe(false);
    // Außenstehende (nicht beigetreten) bekommen in der UI den Hinweis
    await open(outsider);
    await expect(outsider.page.getByText("Nur für Mitglieder")).toBeVisible();

    await bob.page.request.post(`/api/social/posts/${postId}/comments`, { data: { text: `Gemeiner Kommentar ${stamp}` } });
    await open(bob);
    await postCard(bob.page, text).getByRole("button", { name: "Kommentare" }).click();
    await expect(bob.page.getByText(`Gemeiner Kommentar ${stamp}`)).toBeVisible();
    // eigener Kommentar: kein „Melden“
    await expect(bob.page.getByRole("button", { name: "Kommentar melden" })).toHaveCount(0);

    await open(owner);
    await postCard(owner.page, text).getByRole("button", { name: "Kommentare" }).click();
    await owner.page.getByRole("button", { name: "Kommentar melden" }).click();
    await owner.page.getByLabel(/Beleidigung/).check();
    await owner.page.getByRole("button", { name: "Meldung senden" }).click();
    await expect(owner.page.getByText("Danke für die Meldung")).toBeVisible();

    await open(mod, /^Moderation/);
    await expect(mod.page.getByTestId("report-group")).toContainText(`Gemeiner Kommentar ${stamp}`);
    await mod.page.getByRole("button", { name: /Ausblenden/ }).click();
    await expect(mod.page.getByText("Keine offenen Meldungen")).toBeVisible();

    // Mitglied sieht den Kommentar nicht mehr; Zähler am Beitrag sinkt
    await open(alice);
    await postCard(alice.page, text).getByRole("button", { name: "Kommentare" }).click();
    await expect(alice.page.getByText("Noch keine Kommentare")).toBeVisible();
    await outsider.context.close();
    await close();
  });

  test("Rauswurf mit Sperre: Moderator nur Mitglieder, Admin entsperrt, danach Beitritt wieder möglich", async ({ browser }) => {
    const { owner, mod, alice, bob, id, open, close } = await setup(browser, "k");

    // Moderator: Rauswurf nur bei Mitgliedern – nicht beim Admin, nicht bei sich selbst
    await open(mod, /^Mitglieder/);
    await expect(mod.page.getByRole("button", { name: `${alice.name} entfernen` })).toBeVisible();
    await expect(mod.page.getByRole("button", { name: `${owner.name} entfernen` })).toHaveCount(0);
    await expect(mod.page.getByRole("button", { name: `${mod.name} entfernen` })).toHaveCount(0);
    // nur Admins vergeben Rollen: Moderator sieht keine Rollenauswahl
    await expect(mod.page.getByLabel(`Rolle von ${alice.name}`)).toHaveCount(0);
    await expect(mod.page.getByRole("button", { name: /Gesperrt/ })).toHaveCount(0);

    // Admin entfernt bob dauerhaft
    await open(owner, /^Mitglieder/);
    await owner.page.getByRole("button", { name: `${bob.name} entfernen` }).click();
    await owner.page.getByRole("checkbox", { name: /Dauerhaft sperren/ }).click();
    await owner.page.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect(owner.page.getByText("Entfernt und gesperrt")).toBeVisible();
    await expect(owner.page.getByRole("button", { name: `${bob.name} entfernen` })).toHaveCount(0);

    // bob: Zugriff weg, wird live benachrichtigt, Beitritt gesperrt
    await expect(bob.page.getByRole("button", { name: /Benachrichtigungen, 1 ungelesen/ })).toBeVisible();
    expect((await bob.page.request.get(`/api/social/posts?communityId=${id}`)).status()).toBe(404);
    expect((await bob.page.request.post(`/api/communities/${id}/join`)).status()).toBe(403);

    // Admin: Sperrliste → Entsperren → bob kann wieder beitreten
    await owner.page.getByRole("button", { name: /^Moderation/ }).click();
    const bans = owner.page.getByTestId("ban-list");
    await expect(bans).toContainText(bob.name);
    await bans.getByRole("button", { name: "Entsperren" }).click();
    await expect(bans).toContainText("Niemand gesperrt");
    expect((await bob.page.request.post(`/api/communities/${id}/join`)).status()).toBe(200);
    await close();
  });
});
