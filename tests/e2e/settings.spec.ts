import { expect, test } from "@playwright/test";
import { openSettings, register, uniqueEmail } from "./helpers";

test.describe("Profil und Einstellungen (B-71)", () => {
  test("keine erfundenen Abzeichen; Animationen, Sounds und Wochenreport bleiben gespeichert", async ({ page }) => {
    const name = `set_${Date.now().toString(36).slice(-5)}`;
    await register(page, name, uniqueEmail(name));

    // Profil-Reiter: keine festen Abzeichen mehr
    await page.getByRole("button", { name: "Profil öffnen" }).click();
    await expect(page.getByRole("heading", { name: "Abzeichen" })).toHaveCount(0);
    await expect(page.getByText("1k Follower")).toHaveCount(0);

    await openSettings(page);
    await expect(page.getByRole("switch", { name: "Telegram-Bot" })).toHaveCount(0); // ohne Wirkung → ausgeblendet

    const motion = page.getByRole("switch", { name: "Animationen reduzieren" });
    const sound = page.getByRole("switch", { name: "Sounds" });
    const weekly = page.getByRole("switch", { name: "Wochenreport" });
    await expect(motion).toHaveAttribute("aria-checked", "false");
    await expect(sound).toHaveAttribute("aria-checked", "false");
    await expect(weekly).toHaveAttribute("aria-checked", "false"); // Opt-in

    await motion.click();
    await expect(motion).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "on");
    await sound.click();
    await expect(sound).toHaveAttribute("aria-checked", "true");
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/auth/me") && r.request().method() === "PATCH");
    await weekly.click();
    expect((await saved).status()).toBe(200);
    await expect(weekly).toHaveAttribute("aria-checked", "true");

    // Neu laden: Geräteeinstellungen (lokal) und Wochenreport (Server) sind noch da
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "on");
    await openSettings(page);
    await expect(page.getByRole("switch", { name: "Animationen reduzieren" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Sounds" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Wochenreport" })).toHaveAttribute("aria-checked", "true");

    // Wieder ausschalten
    await page.getByRole("switch", { name: "Wochenreport" }).click();
    await expect(page.getByRole("switch", { name: "Wochenreport" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("switch", { name: "Animationen reduzieren" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "off");
  });

  test("Systemeinstellung „weniger Bewegung“ gilt als Vorgabe, die eigene Wahl überstimmt sie", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const name = `sys_${Date.now().toString(36).slice(-5)}`;
    await register(page, name, uniqueEmail(name));
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "on");
    await openSettings(page);
    const motion = page.getByRole("switch", { name: "Animationen reduzieren" });
    await expect(motion).toHaveAttribute("aria-checked", "true");
    await motion.click(); // bewusst wieder an
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "off");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "off");
    await context.close();
  });
});
