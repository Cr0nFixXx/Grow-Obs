import { chromium } from "playwright";
import fs from "fs";
// Usage: (dev server running in MOCK mode) BASE_URL=http://localhost:5173 node promo/capture.mjs -> promo/shots/*.png
const BASE = process.env.BASE_URL || "http://localhost:5173";
fs.mkdirSync("promo/shots", { recursive: true });
const b = await chromium.launch();
const out = "promo/shots/";
async function login(p) {
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const skip = p.getByText("Überspringen");
  if (await skip.count()) await skip.click();
  await p.getByRole("button", { name: "Anmelden" }).last().click();
  await p.waitForSelector("text=/Hallo, Max/");
  await p.waitForTimeout(1500);
}
async function dismissToasts(p) {
  for (const x of await p.locator('button[aria-label*="chließen"], button[aria-label*="Close"]').all()) { try { await x.click({timeout:300}); } catch {} }
}
// DESKTOP
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(p);
  await p.waitForTimeout(6500); // toast verschwindet, Count-ups fertig
  await p.screenshot({ path: out + "d-dashboard.png" });
  const go = async (label, file, extra) => {
    await p.locator("aside").getByText(label, { exact: true }).first().click();
    await p.waitForTimeout(2800);
    if (extra) await extra();
    await p.screenshot({ path: out + file });
    console.log("ok", file);
  };
  await go("Meine Grows", "d-grows.png");
  // Grow-Detail
  try {
    await p.getByText("HazyDream").first().click(); await p.waitForTimeout(3000);
    await p.screenshot({ path: out + "d-growdetail.png" }); console.log("ok growdetail");
  } catch (e) { console.log("growdetail fail", e.message); }
  await go("KI-Assistent", "d-ai.png");
  await go("Sorten-Sammlung", "d-strains.png");
  await go("Kostenrechner", "d-calc.png");
  await go("Simulation", "d-sim.png");
  await go("Forum", "d-forum.png");
  await go("Community-Feed", "d-feed.png");
  await go("Hall of Fame", "d-hall.png");
  await go("Marktplatz", "d-market.png");
  await go("Wiki", "d-wiki.png");
  await go("Breeder & Seeds", "d-breeders.png");
  await go("Communities", "d-communities.png");
  await go("Grow-Planung", "d-planner.png");
  try { await go("Chat", "d-chat.png"); } catch(e){ console.log("chat fail"); }
  await p.close();
}
// MOBILE
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await login(p);
  await p.waitForTimeout(6500);
  await p.screenshot({ path: out + "m-dashboard.png" }); console.log("ok m-dash");
  for (const [label, file] of [["Grows","m-grows.png"],["Forum","m-forum.png"],["Profil","m-profile.png"]]) {
    try { await p.getByRole("button",{name:label}).last().click(); await p.waitForTimeout(2800); await p.screenshot({ path: out + file }); console.log("ok", file);} catch(e){ console.log("fail", file, e.message.slice(0,80)); }
  }
  await ctx.close();
}
await b.close();
