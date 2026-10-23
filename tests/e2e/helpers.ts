import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-long-enough";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Öffnet die App und überspringt das Onboarding (erscheint nur beim ersten Start). */
export async function openAuth(page: Page) {
  await page.goto("/");
  await page.getByText("Überspringen").click();
  await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
}

export async function register(page: Page, name: string, email: string) {
  await openAuth(page);
  await page.getByRole("button", { name: "Registrieren" }).first().click();
  await page.getByPlaceholder("z. B. max_grows").fill(name);
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /AGB/ }).click();
  await page.getByRole("button", { name: "Konto erstellen" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
}

/** Meldet einen bestehenden Nutzer über die Login-Seite an (frischer Browser-Kontext). */
export async function login(page: Page, email: string, password = PASSWORD) {
  await openAuth(page);
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
}

/** Öffnet Profil → Einstellungen (dort liegt „Sitzungen & Geräte“). */
export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Profil öffnen" }).click();
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await expect(page.getByTestId("sessions-card")).toBeVisible();
}
