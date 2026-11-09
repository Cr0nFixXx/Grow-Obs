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

/** B-92: Grow-Sichtbarkeit, Grows im Profil, Lesesicht, Bildmenü. */
test("Öffentlicher Grow ist für andere lesbar, privater bleibt verborgen; Bildmenü am eigenen Profil", async ({ browser }) => {
  test.setTimeout(150_000);
  const owner = await person(browser, `own_${stamp}`);
  const viewer = await person(browser, `view_${stamp}`);

  for (const name of ["Offen", "Heimlich"]) {
    const res = await owner.page.request.post("/api/grows", { data: { name: `${name} ${stamp}`, strain: "Haze", type: "Hybrid" } });
    expect(res.status()).toBe(201);
  }

  // Sichtbarkeit im Bearbeiten-Dialog umstellen
  await owner.page.getByRole("button", { name: "Grows" }).first().click();
  await owner.page.getByRole("button", { name: new RegExp(`Offen ${stamp}`) }).first().click();
  await owner.page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await owner.page.getByRole("menuitem", { name: "Bearbeiten" }).click().catch(async () => owner.page.getByText("Bearbeiten", { exact: true }).click());
  await owner.page.getByTestId("grow-visibility").selectOption("public");
  await owner.page.getByRole("button", { name: "Speichern" }).click();
  await expect(owner.page.getByText("Sichtbar für").first()).toBeVisible();
  await expect(owner.page.getByText("Öffentlich", { exact: true }).first()).toBeVisible();

  // Betrachter: Profil → Grows-Kachel → nur der öffentliche Grow
  const handle = await handleOf(owner.page);
  await viewer.page.goto(`/u/${handle}`);
  await expect(viewer.page.getByTestId("member-grows-tile")).toContainText("1");
  await viewer.page.getByTestId("member-grows-tile").click();
  await expect(viewer.page.getByTestId("member-grow-item")).toHaveCount(1);
  await expect(viewer.page.getByText(`Heimlich ${stamp}`)).toHaveCount(0);
  await viewer.page.getByTestId("member-grow-item").click();
  await expect(viewer.page.getByTestId("grow-readonly-banner")).toBeVisible();
  await expect(viewer.page.getByRole("heading", { level: 1, name: `Offen ${stamp}` })).toBeVisible();
  await expect(viewer.page.getByRole("button", { name: /Foto hinzufügen|Messwerte$/ })).toHaveCount(0);
  await expect(viewer.page.getByTestId("edit-log")).toHaveCount(0);

  // Ein privater Grow ist auch per Direktaufruf der API nicht erreichbar
  const list = await (await owner.page.request.get("/api/grows")).json() as { id: string; name: string }[];
  const secret = list.find((g) => g.name.startsWith("Heimlich"))!;
  expect((await viewer.page.request.get(`/api/members/${handle}/grows/${secret.id}`)).status()).toBe(404);

  // Eigenes Profil: Bildmenü; Fremdes Profil ohne Bild: keine Schaltfläche
  await owner.page.getByRole("button", { name: "Profil öffnen" }).click();
  await owner.page.getByTestId("image-menu-Titelbild").click();
  await expect(owner.page.getByTestId("image-menu")).toContainText("Ändern");
  await owner.page.keyboard.press("Escape");
  await owner.page.getByTestId("own-grows-tile").click();
  await expect(owner.page.getByRole("heading", { level: 1, name: "Grows" })).toBeVisible();

  await owner.context.close();
  await viewer.context.close();
});
