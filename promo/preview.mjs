import { chromium } from "playwright";
import fs from "fs";
// Usage: node promo/preview.mjs 1.0,5.5,12 -> promo/test/t<time>.jpg (single still frames for quick review)
fs.mkdirSync("promo/test", { recursive: true });
const times = process.argv[2].split(",").map(Number);
const br = await chromium.launch({ args: ["--disable-gpu"] });
const page = await br.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", e => console.log("PAGEERR", e.message));
await page.goto(new URL("./scene.html", import.meta.url).href);
await page.evaluate(() => window.ready);
for (const t of times) {
  await page.evaluate(t => window.renderFrame(t), t);
  await page.screenshot({ path: `promo/test/t${String(t).replace(".", "_")}.jpg`, type: "jpeg", quality: 85 });
}
await br.close();
