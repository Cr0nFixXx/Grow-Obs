import { expect, test, type Browser, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const stamp = Date.now().toString(36).slice(-5);

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, name, uniqueEmail(name));
  return { page, context };
}
const openProfile = async (page: Page) => { await page.getByRole("button", { name: "Profil öffnen" }).click(); await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible(); };

test.describe("Profile und Folgen (B-73)", () => {
  test("Profil ausfüllen, auf „Nur Follower“ stellen, Anfrage senden und bestätigen – Inhalte erst danach sichtbar", async ({ browser }) => {
    const [a, b] = [`prof_a_${stamp}`, `prof_b_${stamp}`];
    const A = await person(browser, a);
    const B = await person(browser, b);

    // B füllt das Profil aus
    await openProfile(B.page);
    await B.page.getByRole("button", { name: "Bearbeiten" }).click();
    await B.page.getByLabel("Über mich").fill("Balkon-Grower aus dem Ruhrgebiet");
    await B.page.getByLabel("Ort").fill("Dortmund");
    await B.page.getByLabel("Anbau seit (Jahr)").fill("2021");
    await B.page.getByRole("button", { name: "Coco", exact: true }).first().click();
    await B.page.getByRole("button", { name: "Indoor", exact: true }).click();
    await B.page.getByRole("button", { name: "Speichern" }).click();
    await expect(B.page.getByText("Balkon-Grower aus dem Ruhrgebiet")).toBeVisible();
    await expect(B.page.getByText("Baut an seit 2021")).toBeVisible();
    await expect(B.page.getByText("Lvl")).toHaveCount(0);

    // B stellt die Sichtbarkeit um
    await B.page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
    await B.page.getByRole("button", { name: "Nur Follower", exact: true }).click();
    await expect(B.page.getByText("Sichtbarkeit gespeichert")).toBeVisible();

    // Der Benutzername entsteht aus dem Namen plus Zufallsanhang – aus der Seite lesen
    const handle = ((await B.page.getByText(new RegExp(`^@${b}\\w* · `)).first().textContent()) ?? "").split(" · ")[0]!.slice(1);
    expect(handle).toContain(b);

    // A sieht nur die Kopfdaten und sendet eine Anfrage
    await A.page.goto(`/u/${handle}`);
    await expect(A.page.getByRole("heading", { level: 1, name: b })).toBeVisible();
    await expect(A.page.getByText("nur für Follower sichtbar")).toBeVisible();
    await expect(A.page.getByText("Balkon-Grower aus dem Ruhrgebiet")).toHaveCount(0);
    await A.page.getByRole("button", { name: "Anfrage senden" }).click();
    await expect(A.page.getByRole("button", { name: /Angefragt/ })).toBeVisible();
    await expect(A.page.getByText("wartet auf Bestätigung")).toBeVisible();

    // B bestätigt (Profil-Tab, Karte „Follower-Anfragen“)
    await B.page.getByRole("button", { name: "Profil", exact: true }).first().click();
    const card = B.page.locator("section,div").filter({ hasText: "Follower-Anfragen" }).last();
    await expect(card).toContainText(a);
    await B.page.getByRole("button", { name: "Annehmen" }).click();
    await expect(B.page.getByText("Follower-Anfragen")).toHaveCount(0);

    // A sieht jetzt alles und folgt
    await A.page.reload();
    await expect(A.page.getByText("Balkon-Grower aus dem Ruhrgebiet")).toBeVisible();
    await expect(A.page.getByText("Dortmund")).toBeVisible();
    await expect(A.page.getByRole("button", { name: /Gefolgt/ })).toBeVisible();

    // Entfolgen schließt das Profil wieder
    await A.page.getByRole("button", { name: /Gefolgt/ }).click();
    await expect(A.page.getByText("nur für Follower sichtbar")).toBeVisible();

    await A.context.close(); await B.context.close();
  });

  test("Benutzername ändern: sofort wirksam, danach 30 Tage gesperrt; unbekannte Profile zeigen einen Fehler", async ({ browser }) => {
    const a = `prof_h_${stamp}`;
    const A = await person(browser, a);
    await openProfile(A.page);
    await A.page.getByRole("button", { name: "Bearbeiten" }).click();
    await A.page.getByLabel("Benutzername").fill(`neu_${stamp}`);
    await A.page.getByRole("button", { name: "Speichern" }).click();
    await expect(A.page.getByText(`@neu_${stamp}`).first()).toBeVisible();
    await A.page.getByRole("button", { name: "Bearbeiten" }).click();
    await expect(A.page.getByLabel("Benutzername")).toBeDisabled();
    await expect(A.page.getByText(/Wieder änderbar ab/)).toBeVisible();
    await A.page.goto("/u/gibt_es_nicht_xyz");
    await expect(A.page.getByText("Profil nicht verfügbar")).toBeVisible();
    await A.context.close();
  });

  test("Titelbild hochladen, speichern, auf dem Profil sehen und wieder entfernen", async ({ browser }) => {
    const A = await person(browser, `prof_c_${stamp}`);
    await openProfile(A.page);
    await A.page.getByRole("button", { name: "Bearbeiten" }).click();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await A.page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
    await expect(A.page.locator('img[src*="/media/"]').first()).toBeVisible();
    await A.page.getByRole("button", { name: "Speichern" }).click();
    const banner = A.page.locator('main img[src*="/media/"]').first();
    await expect(banner).toBeVisible();
    await expect.poll(() => banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await A.page.reload();
    await expect(A.page.locator('main img[src*="/media/"]').first()).toBeVisible();
    await A.page.getByRole("button", { name: "Bearbeiten" }).click();
    await A.page.getByRole("button", { name: "Entfernen" }).first().click();
    await A.page.getByRole("button", { name: "Speichern" }).click();
    await expect(A.page.locator('main img[src*="/media/"]')).toHaveCount(0);
    await A.context.close();
  });
});
