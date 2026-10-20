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

test.describe("Gruppenchat (B-65)", () => {
  test("Gruppe anlegen, einladen, annehmen, Thema anlegen, schreiben und Schreibrechte sperren – live zwischen zwei Nutzern", async ({ browser }) => {
    const [a, b] = [`grp_a_${stamp}`, `grp_b_${stamp}`];
    const A = await person(browser, a);
    const B = await person(browser, b);

    // A legt die Gruppe an und lädt B ein
    await chatNav(A.page).click();
    await A.page.getByRole("button", { name: "Neue Gruppe" }).click();
    const create = A.page.getByRole("button", { name: "Gruppe erstellen" });
    await A.page.getByLabel("Gruppenname").fill("Growfreunde");
    await expect(create).toBeDisabled(); // ohne eingeladene Person
    await A.page.getByLabel("Personen suchen").fill(b);
    await A.page.getByRole("button", { name: new RegExp(b) }).click();
    await create.click();
    await expect(A.page.getByRole("tab", { name: /Allgemein/ })).toBeVisible();
    await expect(A.page.getByText("2 Mitglieder")).toHaveCount(0); // B ist erst nach Annahme Mitglied (bis dahin „1 Mitglied“)
    await expect(A.page.getByTestId("system-line").filter({ hasText: `${a} hat die Gruppe erstellt` })).toBeVisible();

    // B sieht die Einladung ohne Neuladen und nimmt an
    await chatNav(B.page).click();
    const banner = B.page.getByTestId("invite-banner");
    await expect(banner).toContainText("Growfreunde");
    await expect(banner).toContainText(`${a} lädt dich ein`);
    await banner.getByRole("button", { name: "Annehmen" }).click();
    await expect(B.page.getByRole("tab", { name: /Allgemein/ })).toBeVisible();
    await expect(B.page.getByTestId("invite-banner")).toHaveCount(0);
    await expect(B.page.getByTestId("system-line").filter({ hasText: `${b} ist der Gruppe beigetreten` })).toBeVisible();

    // A legt das Thema „Technik“ an; B sieht es live
    await A.page.getByRole("button", { name: "Gruppen-Info" }).click();
    await A.page.getByRole("tab", { name: "Themen" }).click();
    await A.page.getByLabel("Name des neuen Themas").fill("Technik");
    await A.page.getByRole("button", { name: "Thema erstellen" }).click();
    await expect(A.page.getByTestId("topic-row").filter({ hasText: "Technik" })).toBeVisible();
    await A.page.keyboard.press("Escape");
    await expect(B.page.getByRole("tab", { name: /Technik/ })).toBeVisible();

    // B schreibt in „Technik“; A sieht Zähler, Absender und Text
    await B.page.getByRole("tab", { name: /Technik/ }).click();
    await B.page.getByPlaceholder("Nachricht schreiben…").fill("Frage zur Lampe");
    await B.page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(A.page.getByRole("tab", { name: /Technik/ }).getByTestId("topic-unread")).toHaveText("1");
    await A.page.getByRole("tab", { name: /Technik/ }).click();
    await expect(A.page.getByRole("log").getByText("Frage zur Lampe")).toBeVisible();
    await expect(A.page.getByTestId("sender-name").filter({ hasText: b })).toBeVisible();
    await expect(A.page.getByRole("tab", { name: /Technik/ }).getByTestId("topic-unread")).toHaveCount(0); // gelesen

    // „Nur Admins schreiben“: B kann in „Technik“ nicht mehr schreiben (Hinweis statt Eingabe)
    await A.page.getByRole("button", { name: "Gruppen-Info" }).click();
    await A.page.getByRole("tab", { name: "Themen" }).click();
    await A.page.getByTestId("topic-row").filter({ hasText: "Technik" }).getByRole("button", { name: "Bearbeiten" }).click();
    await A.page.getByRole("switch", { name: "Nur Admins schreiben" }).click();
    await expect(B.page.getByTestId("composer-blocked")).toContainText("nur Admins");
    await expect(B.page.getByPlaceholder("Nachricht schreiben…")).toHaveCount(0);

    await A.context.close();
    await B.context.close();
  });
});
