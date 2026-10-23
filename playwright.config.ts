import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-E2E gegen den Produktions-Build (`node scripts/server.mjs`, WebSocket-fähig) mit echter PostgreSQL-Datenbank.
 * Voraussetzung: `npm run build`, laufendes PostgreSQL und eine Wegwerf-DB (E2E_DATABASE_URL, Standard `growobserver_e2e`).
 * Start: `npm run test:e2e` (einmalig `npx playwright install chromium`).
 * Die Tests legen eindeutige Nutzer an und löschen keine Daten → nie gegen Produktiv-DBs laufen lassen.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", testMatch: /mobile\.spec/, use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `node scripts/server.mjs -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "e2e-only-secret-not-for-deploy-0123456789abcdef",
      JWT_TTL: "1h",
      NODE_ENV: "production",
      // Die E2E-Suite legt mehr als 10 Konten pro Stunde an (Register-Limit pro IP); die Limits selbst prüfen die API-Tests.
      RATE_LIMIT_DISABLED: "true",
      // Test-VAPID-Paar (kein Geheimnis): Push gilt als eingerichtet; die UI-Tests senden nie real.
      VAPID_PUBLIC_KEY: "BEcxMBNPs4EXEYkVI3q70p5hp_3ZX-xAFtgO6V8wNWtdHMymxB8Azr5iF0WaIRMbBopjjO5hJQofUmzpfVKHVrw",
      VAPID_PRIVATE_KEY: "DvS0bLStOkLDsh1IKckFRVzKkQKde6K2MuS3pYRZphw",
      VAPID_SUBJECT: "mailto:test@example.test",
    },
  },
});
