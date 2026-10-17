import { expect, test } from "@playwright/test";
import { login, openAuth, openSettings, PASSWORD, register, uniqueEmail } from "./helpers";

test.describe("Sitzungen (HttpOnly-Cookie, B-54)", () => {
  test("Token ist für JavaScript unsichtbar: HttpOnly-Cookie, nichts im Speicher", async ({ page, context }) => {
    await register(page, "Cookie Tester", uniqueEmail("cookie"));
    const cookie = (await context.cookies()).find((c) => c.name === "go_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");

    const exposed = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expect(exposed.cookie).not.toContain("go_session");
    expect(`${exposed.local}${exposed.session}`).not.toMatch(/eyJ/); // kein JWT
  });

  test("Abmelden widerruft die Sitzung serverseitig – ein kopiertes Cookie ist danach wertlos", async ({ page, context, request }) => {
    await register(page, "Revoke Tester", uniqueEmail("revoke"));
    const stolen = (await context.cookies()).find((c) => c.name === "go_session")!;
    const asStolen = () => request.get("/api/auth/me", { headers: { Cookie: `go_session=${stolen.value}` } });
    expect((await asStolen()).status()).toBe(200);

    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

    expect((await asStolen()).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
  });

  test("zwei Geräte: ein Gerät beendet das andere", async ({ browser }) => {
    const email = uniqueEmail("devices");
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await register(a, "Device Tester", email);
    await login(b, email);

    await openSettings(a);
    await expect(a.getByTestId("session-row")).toHaveCount(2);
    await expect(a.getByTestId("sessions-card").getByText("Dieses Gerät", { exact: true })).toHaveCount(1);
    await a.getByRole("button", { name: "Beenden" }).click();
    await expect(a.getByTestId("session-row")).toHaveCount(1);

    await b.reload();
    await expect(b.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await a.goto("/"); // seit B-57 bleibt ein Reload auf der Profil-URL; „/“ lädt das Dashboard
    await expect(a.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible(); // a bleibt angemeldet
    await a.context().close();
    await b.context().close();
  });

  test("„Auf allen Geräten abmelden“ beendet auch diese Sitzung", async ({ browser }) => {
    const email = uniqueEmail("all");
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await register(a, "All Tester", email);
    await login(b, email);

    await openSettings(a);
    await a.getByRole("button", { name: "Auf allen Geräten abmelden" }).click();
    await expect(a.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();

    await b.reload();
    await expect(b.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await a.context().close();
    await b.context().close();
  });

  test("ein serverseitig beendetes Gerät wird bei der nächsten Aktion lokal abgemeldet", async ({ browser }) => {
    const email = uniqueEmail("expire");
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await register(a, "Expire Tester", email);
    await login(b, email);

    await openSettings(a);
    await a.getByRole("button", { name: "Beenden" }).click();
    await expect(a.getByTestId("session-row")).toHaveCount(1);

    // b hat noch eine Seite offen, deren nächste Anfrage 401 liefert → zurück zum Login ohne Reload.
    await b.getByRole("button", { name: "Meine Grows" }).first().click();
    await expect(b.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await a.context().close();
    await b.context().close();
  });

  test("fremder Origin kann nicht abmelden (CSRF)", async ({ page, context, request }) => {
    await register(page, "Csrf Tester", uniqueEmail("csrf"));
    const cookie = (await context.cookies()).find((c) => c.name === "go_session")!;
    const evil = await request.post("/api/auth/logout-all", {
      headers: { Cookie: `go_session=${cookie.value}`, Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    });
    expect(evil.status()).toBe(403);
    expect((await request.get("/api/auth/me", { headers: { Cookie: `go_session=${cookie.value}` } })).status()).toBe(200);
  });

  test("Passwort ändern: andere Geräte werden abgemeldet, dieses bleibt, neues Passwort gilt, Protokoll zeigt es", async ({ browser }) => {
    const email = uniqueEmail("pwchange");
    const NEW = "e2e-new-password-also-long";
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await register(a, "Passwort Tester", email);
    await login(b, email);

    await openSettings(a);
    const card = a.getByTestId("password-card");
    await card.getByLabel(/^Aktuelles Passwort/).fill("falsches-passwort-lang");
    await card.getByLabel(/^Neues Passwort(?! wiederholen)/).fill(NEW);
    await card.getByLabel(/^Neues Passwort wiederholen/).fill(NEW);
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(card.getByRole("alert")).toHaveText(/Aktuelles Passwort ist falsch/);
    await expect(a.getByTestId("sessions-card")).toBeVisible(); // 403 meldet NICHT ab

    await card.getByLabel(/^Aktuelles Passwort/).fill(PASSWORD);
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(a.getByText("Andere Geräte wurden abgemeldet.")).toBeVisible();
    await expect(a.getByTestId("session-row")).toHaveCount(1); // Liste lädt nach der Änderung neu

    const history = a.getByTestId("login-history-card");
    await expect(history.getByText("Passwort geändert")).toBeVisible();
    await expect(history.getByText("Anmeldung fehlgeschlagen")).toBeVisible(); // der falsche Versuch
    await expect(history.getByText("Konto erstellt")).toBeVisible();
    await expect(history.getByText(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)).toHaveCount(0); // keine IP

    await b.reload();
    await expect(b.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
    await a.goto("/"); // seit B-57 bleibt ein Reload auf der Profil-URL; „/“ lädt das Dashboard
    await expect(a.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
    await a.context().close();

    const c = await (await browser.newContext()).newPage();
    await openAuth(c);
    await c.getByPlaceholder("du@example.com").fill(email);
    await c.getByPlaceholder("••••••••").fill(PASSWORD);
    await c.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(c.getByRole("heading", { level: 1, name: /^Hallo,/ })).toHaveCount(0); // altes Passwort wird abgelehnt
    await c.getByPlaceholder("••••••••").fill(NEW);
    await c.getByRole("button", { name: "Anmelden" }).last().click();
    await expect(c.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
    await b.context().close();
    await c.context().close();
  });
});
