import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test("Mobil (Pixel 5): Bottom-Navigation vorhanden, Menü öffnet, kein horizontaler Überlauf", async ({ page }) => {
  await register(page, "Mobile Tester", uniqueEmail("mobile"));
  for (const name of ["Home", "Grows", "Forum", "Profil", "Mehr"]) {
    await expect(page.getByRole("button", { name, exact: true }).last()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Forum", exact: true }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
});

const stamp = Date.now().toString(36).slice(-5);

/** Kein horizontaler Überlauf (sonst verkleinert/verschiebt der mobile Browser die Seite) und kein Seiten-Scroll. */
async function expectFitsScreen(page: Page, vertical = true) {
  const m = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowY: document.documentElement.scrollHeight - window.innerHeight,
    innerWidth: window.innerWidth,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
  }));
  expect(m.overflowX).toBeLessThanOrEqual(1);
  if (vertical) expect(m.overflowY).toBeLessThanOrEqual(1);
  expect(Math.abs(m.visualWidth - m.innerWidth)).toBeLessThanOrEqual(1); // Layout-Viewport nicht aufgeweitet
}

test("Mobil: Zoom und Übersetzungsangebot sind aus, der Chat füllt den Bildschirm (360 px, Hochformat und Querformat)", async ({ page, browser }) => {
  const [a, b] = [`mob_a_${stamp}`, `mob_b_${stamp}`];
  const other = await (await browser.newContext()).newPage();
  await register(other, b, uniqueEmail(b));
  await register(page, a, uniqueEmail(a));

  // Kein Pinch-Zoom, keine Übersetzungsleiste/-menü von Chrome
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /user-scalable=no/);
  await expect(page.locator('meta[name="google"]')).toHaveAttribute("content", "notranslate");
  await expect(page.locator("html")).toHaveAttribute("translate", "no");
  // Oberfläche nicht markierbar (Chrome-Suchleiste), Eingabefelder weiterhin
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe("none");

  await page.getByRole("button", { name: "Mehr", exact: true }).last().click();
  await page.getByRole("button", { name: /^Chat/ }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: "Chat" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 600 });
  await expectFitsScreen(page, false); // Liste + Kopfzeile bei 360 px ohne Überlauf

  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  await page.getByLabel("Person suchen").fill(b);
  await page.getByRole("button", { name: new RegExp(b) }).click();
  const box = page.getByPlaceholder("Nachricht schreiben…");
  await expect(box).toBeVisible();
  expect(await box.evaluate((el) => getComputedStyle(el).userSelect)).toBe("text");
  for (let i = 0; i < 10; i++) {
    await box.fill(`Nachricht ${i} ${"lang ".repeat(i * 4)}`);
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(box).toHaveValue("");
  }
  const screen = page.getByTestId("chat-fullscreen");
  for (const [width, height] of [[360, 600], [393, 727], [740, 360]] as const) {
    await page.setViewportSize({ width, height });
    await expect(screen).toBeVisible();
    await expectFitsScreen(page);
    const rect = await screen.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, innerHeight: window.innerHeight }; });
    expect(rect.top).toBe(0);
    expect(Math.round(rect.bottom)).toBe(rect.innerHeight);
    const composer = await box.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(composer).toBeLessThanOrEqual(rect.innerHeight); // Eingabefeld bleibt sichtbar
    await expect(page.getByRole("log", { name: "Chat-Verlauf" }).getByText(/^Nachricht 9/)).toBeVisible(); // ganz unten
  }

  // Zurück zur Liste: keine Vollbild-Ebene mehr, Seite wieder normal
  await page.setViewportSize({ width: 393, height: 727 });
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Neue Nachricht" })).toBeVisible();
  await expectFitsScreen(page, false); // die Liste darf die Seite verlängern, aber nie seitlich überlaufen
});

test("Mobil 360 px: Einstellungen, Simulation und Telegram laufen nicht über den Rand; Seitentitel wechselt mit der Ansicht", async ({ page }) => {
  const name = `mob_v_${stamp}`;
  await register(page, name, uniqueEmail(name));
  await page.setViewportSize({ width: 360, height: 640 });
  for (const [path, title] of [["/profile/settings", "Profil"], ["/simulation", "Simulation"], ["/telegram", "Telegram"], ["/strains", "Sorten"]] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} · Grow|Observer`);
    await page.waitForTimeout(600); // Einblend-Animation der Ansicht
    await expectFitsScreen(page, false);
  }
  // Eingabefelder auf dem Telefon mind. 16 px (iOS zoomt sonst beim Fokussieren)
  await page.goto("/strains");
  const sizes = await page.locator("input:visible, textarea:visible, select:visible").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
});

test("Mobil: Nachricht kopieren, fehlgeschlagenes Senden bleibt sichtbar und lässt sich erneut senden", async ({ page, browser }) => {
  const [a, b] = [`mob_c_${stamp}`, `mob_d_${stamp}`];
  const other = await (await browser.newContext()).newPage();
  await register(other, b, uniqueEmail(b));
  await register(page, a, uniqueEmail(a));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/chat");
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  await page.getByLabel("Person suchen").fill(b);
  await page.getByRole("button", { name: new RegExp(b) }).click();
  const box = page.getByPlaceholder("Nachricht schreiben…");
  const log = page.getByRole("log", { name: "Chat-Verlauf" });

  // Erste Nachricht geht durch → Kopieren-Knopf (Text ist nicht mehr markierbar)
  await box.fill("Hallo zum Kopieren");
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(log.getByText("Hallo zum Kopieren")).toBeVisible();
  await log.getByRole("button", { name: "Nachricht kopieren" }).first().click();
  await expect(page.getByText("Nachricht kopiert")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Hallo zum Kopieren");

  // Netzwerkfehler beim Senden: Hinweis bleibt stehen, Text bleibt im Feld
  let offline = true;
  await page.route("**/api/chat/*/messages", (route) => {
    if (offline && route.request().method() === "POST") return route.abort("failed");
    return route.continue();
  });
  await box.fill("Zweite Nachricht");
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  const banner = page.getByTestId("send-failed");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Keine Verbindung");
  await expect(box).toHaveValue("Zweite Nachricht");
  await page.waitForTimeout(1500);
  await expect(banner).toBeVisible(); // verschwindet nicht von allein (anders als ein Toast)

  // Verbindung wieder da → „Erneut senden“
  offline = false;
  await banner.getByRole("button", { name: "Erneut senden" }).click();
  await expect(banner).toHaveCount(0);
  await expect(log.getByText("Zweite Nachricht")).toBeVisible();
  await expect(box).toHaveValue("");
});

test("Mobil 360 px: Einstellungs-Gruppen klappen auf, Kostenrechner zeigt das Ergebnis dauerhaft, Dialog im Querformat oben", async ({ page }) => {
  const name = `mob_s_${stamp}`;
  await register(page, name, uniqueEmail(name));
  await page.setViewportSize({ width: 360, height: 640 });

  // Einstellungen: standardmäßig zu → kurze Seite (vorher ≈ 3360 px), per Tipp aufklappbar
  await page.goto("/profile/settings");
  await page.waitForTimeout(600);
  const heightClosed = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(heightClosed).toBeLessThan(2000);
  const group = page.getByRole("button", { name: "Darstellung" });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Partikel-Effekte")).toBeHidden();
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Partikel-Effekte")).toBeVisible();
  await expectFitsScreen(page, false);

  // Kostenrechner: Ergebnisleiste klebt unter der Kopfzeile, auch nach dem Scrollen
  await page.goto("/calculator");
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 500));
  const sticky = page.getByTestId("calc-sticky");
  await expect(sticky).toBeVisible();
  const top = await sticky.evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(40);
  expect(top).toBeLessThan(110);

  // Dashboard: keine Lücke neben der dritten Kennzahl
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
  await expectFitsScreen(page, false);

  // Querformat: der Dialog „Neue Nachricht“ sitzt oben (wächst beim Suchen nicht unter der Fingerspitze weg)
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  await page.getByLabel("Person suchen").fill("zz");
  const dialogTop = await page.getByRole("dialog").evaluate((el) => el.getBoundingClientRect().top);
  expect(dialogTop).toBeLessThan(40);
});
