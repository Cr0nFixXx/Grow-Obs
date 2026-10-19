// Captures the app in MOCK mode as promo assets (PNG) into $PM/assets (default ~/.cache/pm/assets).
//   BASE_URL=http://localhost:5173 node promo-kit/tools/capture.mjs
// Mobile: <key>-f.png (390x844 viewport @2x), <key>-t.png (tall page). Desktop: d-<key>.png (1440x900 @2x).
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = process.env.OUT || path.join(os.homedir(), ".cache/pm/assets");
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ["--no-sandbox"] });

async function login(p) {
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const skip = p.getByText("Überspringen"); if (await skip.count()) await skip.click();
  await p.getByRole("button", { name: "Anmelden" }).last().click();
  await p.waitForSelector("text=/Hallo, Max/");
  await p.waitForTimeout(6500);
}
const closeToasts = async (p) => { for (const x of await p.locator('button[aria-label*="chließen"]').all()) { try { await x.click({ timeout: 300 }); } catch {} } };

// ---------------- MOBILE ----------------
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  await login(p);
  async function shot(key, settle = 2500) {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(settle); await closeToasts(p);
    await p.screenshot({ path: `${OUT}/${key}-f.png` });
    let h = await p.evaluate(() => document.documentElement.scrollHeight); h = Math.min(Math.max(h, 844), 3600);
    await p.setViewportSize({ width: 390, height: h }); await p.waitForTimeout(1800);
    await p.screenshot({ path: `${OUT}/${key}-t.png` }); await p.setViewportSize({ width: 390, height: 844 });
    console.log("ok m", key, h);
  }
  const bottom = (n) => p.locator("nav").getByText(n, { exact: true }).last().click();
  const drawer = async (label) => {
    await p.getByRole("button", { name: "Menü öffnen" }).first().click(); await p.waitForTimeout(700);
    await p.getByRole("button", { name: label }).first().evaluate((el) => el.click()); await p.waitForTimeout(600);
  };
  const steps = [
    ["dash", async () => {}], ["grows", () => bottom("Grows")],
    ["growdetail", async () => { await p.getByText("HazyDream").first().click(); }],
    ["forum", () => bottom("Forum")], ["wiki", () => drawer("Wiki")], ["calc", () => drawer("Kostenrechner")],
    ["strains", () => drawer("Sorten-Sammlung")], ["sim", () => drawer("Simulation")],
    ["feed", () => drawer("Community-Feed")], ["market", () => drawer("Marktplatz")], ["hall", () => drawer("Hall of Fame")],
  ];
  for (const [key, go] of steps) { try { await go(); await shot(key); } catch (e) { console.log("FAIL m", key, e.message.slice(0, 100)); } }
  // overlays: drawer, drawer scrolled (install button), "Mehr" sheet, chat conversation
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.waitForSelector("text=/Hallo, Max/"); await p.waitForTimeout(6000); await closeToasts(p);
  const snap = (n) => p.screenshot({ path: `${OUT}/${n}-f.png` });
  await p.getByRole("button", { name: "Menü öffnen" }).first().click(); await p.waitForTimeout(1000); await snap("drawer");
  await p.evaluate(() => { for (const e of document.querySelectorAll("*")) { const c = getComputedStyle(e); if ((c.overflowY == "auto" || c.overflowY == "scroll") && e.scrollHeight > e.clientHeight + 10) e.scrollTop = 9999; } });
  await p.waitForTimeout(500); await snap("drawer2");
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Mehr" }).last().click(); await p.waitForTimeout(1000); await snap("more");
  await p.getByRole("button", { name: /^Chat/ }).last().click(); await p.waitForTimeout(5000); await snap("chat");
  console.log("ok overlays");
  await ctx.close();
}
// ---------------- DESKTOP ----------------
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(8000);
  await login(p);
  await p.screenshot({ path: `${OUT}/d-dashboard.png` });
  const go = async (label, file) => {
    try { await p.locator("aside").getByText(label, { exact: true }).first().click(); await p.waitForTimeout(2800); await p.screenshot({ path: `${OUT}/${file}.png` }); console.log("ok d", file); }
    catch (e) { console.log("FAIL d", file, e.message.slice(0, 80)); }
  };
  await go("Meine Grows", "d-grows");
  try { await p.getByText("HazyDream").first().click(); await p.waitForTimeout(3000); await p.screenshot({ path: `${OUT}/d-growdetail.png` }); console.log("ok d growdetail"); } catch { console.log("FAIL d growdetail"); }
  for (const [l, f] of [["Sorten-Sammlung","d-strains"],["Kostenrechner","d-calc"],["Simulation","d-sim"],["Forum","d-forum"],["Community-Feed","d-feed"],["Hall of Fame","d-hall"],["Marktplatz","d-market"],["Wiki","d-wiki"],["Chat","d-chat"]]) await go(l, f);
  await p.close();
}
await b.close();
