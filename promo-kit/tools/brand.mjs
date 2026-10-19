// Builds the brand PNGs/SVG in ../brand: icon-512/1024.png, wordmark.png, lockup.png (all transparent), wordmark.svg.
//   node tools/brand.mjs
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { pathToFileURL } from "url";
const setHtml = async (p, html) => { const f = path.join(os.tmpdir(), "pk-" + process.pid + ".html"); fs.writeFileSync(f, html); await p.goto(pathToFileURL(f).href); };
import { KIT } from "./lib.mjs";
const fonts = pathToFileURL(path.join(KIT, "engine/fonts.css")).href;
const icon = fs.readFileSync(path.join(KIT, "brand/icon.svg"), "utf8");
const word = (size) => `<span style="font-family:'Space Grotesk';font-weight:700;font-size:${size}px;letter-spacing:-.035em;line-height:1"><span style="color:#fff">Grow</span><span style="color:#a9f5bb">|</span><span style="color:#45bd5c">Observer</span></span>`;
const br = await chromium.launch({ args: ["--no-sandbox"] });
async function shot(html, w, h, file, scale = 1) {
  const p = await br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await setHtml(p, `<html><head><link rel="stylesheet" href="${fonts}"><style>html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(KIT, "brand", file), omitBackground: true }); await p.close();
}
for (const s of [512, 1024]) await shot(`<div style="width:${s}px;height:${s}px">${icon.replace(/width="512" height="512"/, 'width="100%" height="100%"')}</div>`, s, s, `icon-${s}.png`);
await shot(`<div style="width:1500px;height:300px;display:flex;align-items:center;justify-content:center">${word(190)}</div>`, 1500, 300, "wordmark.png");
await shot(`<div style="width:1900px;height:420px;display:flex;align-items:center;justify-content:center;gap:48px"><div style="width:300px;height:300px">${icon.replace(/width="512" height="512"/, 'width="100%" height="100%"')}</div>${word(210)}</div>`, 1900, 420, "lockup.png");
fs.writeFileSync(path.join(KIT, "brand/wordmark.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="300" viewBox="0 0 1500 300"><text x="750" y="205" text-anchor="middle" font-family="'Space Grotesk',Inter,sans-serif" font-weight="700" font-size="190" letter-spacing="-6.6"><tspan fill="#ffffff">Grow</tspan><tspan fill="#a9f5bb">|</tspan><tspan fill="#45bd5c">Observer</tspan></text></svg>\n`);
await br.close(); console.log("brand assets written");
