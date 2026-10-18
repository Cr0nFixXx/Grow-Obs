import { chromium } from "playwright";
import fs from "fs";
// Usage: node promo/render.mjs <firstFrame> <endFrame(excl.)> <outDir> [step=1] [jpegQuality=92]
// Renders scene.html deterministically: frame f shows time f/30 s.
const [,, a, b, dir, step="1", q="92"] = process.argv;
const FPS = 30;
fs.mkdirSync(dir, { recursive: true });
const br = await chromium.launch({ args: ["--disable-gpu", "--font-render-hinting=none"] });
const page = await br.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", e => console.log("PAGEERR", e.message));
page.on("console", m => { if (m.type()==="error") console.log("CONSOLE", m.text()); });
await page.goto(new URL("./scene.html", import.meta.url).href);
await page.evaluate(() => window.ready);
const t0 = Date.now();
for (let f = +a; f < +b; f += +step) {
  await page.evaluate(t => window.renderFrame(t), f / FPS);
  await page.screenshot({ path: `${dir}/f${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: +q });
  if ((f - a) % 30 === 0) console.log("frame", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
await br.close();
