// Device mockups with transparent background: phone frame + screenshot, browser window + screenshot.
//   node tools/mockups.mjs     -> ../mockups/phone-<key>.png (621x1302) and browser-<key>.png (1800x1170)
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { pathToFileURL } from "url";
const setHtml = async (p, html) => { const f = path.join(os.tmpdir(), "pk-" + process.pid + ".html"); fs.writeFileSync(f, html); await p.goto(pathToFileURL(f).href); };
import { KIT } from "./lib.mjs";
const shots = path.join(KIT, "screenshots"), out = path.join(KIT, "mockups"); fs.mkdirSync(out, { recursive: true });
const fonts = pathToFileURL(path.join(KIT, "engine/fonts.css")).href;
const u = (p) => pathToFileURL(p).href;
const phones = fs.readdirSync(path.join(shots, "mobile")).filter((f) => f.endsWith("-f.jpg") && !/^(drawer2|more)/.test(f)).map((f) => f.replace("-f.jpg", ""));
const wins = fs.readdirSync(path.join(shots, "desktop")).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/^d-|\.jpg$/g, ""));
const br = await chromium.launch({ args: ["--no-sandbox"] });
const page = async (w, h, s) => br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s });
const css = `html,body{margin:0;background:transparent}
.phone{width:414px;height:868px;border-radius:66px;background:linear-gradient(145deg,#2a3b2f,#0a0f0b 42%,#1b281e);padding:12px;box-sizing:border-box;box-shadow:0 0 0 2px rgba(255,255,255,.1) inset,0 0 0 1px rgba(0,0,0,.6)}
.scr{width:390px;height:844px;border-radius:54px;background-size:390px 844px;position:relative;overflow:hidden}
.gloss{position:absolute;inset:0;border-radius:54px;background:linear-gradient(115deg,rgba(255,255,255,.10),rgba(255,255,255,0) 28%)}
.win{width:1440px;height:936px;border-radius:20px;overflow:hidden;background:#080c09;border:1.5px solid rgba(255,255,255,.14);box-sizing:border-box;position:relative;font-family:Inter}
.bar{height:36px;background:linear-gradient(#141d17,#0e150f);display:flex;align-items:center;gap:9px;padding:0 16px;font-size:14px;color:rgba(235,245,238,.55);font-weight:600;position:relative}
.bar i{width:12px;height:12px;border-radius:50%}.bar span{position:absolute;left:0;right:0;text-align:center}
.shot{height:900px;background-size:1440px 900px}`;
let n = 0;
{ const p = await page(414, 868, 1.5);
  for (const k of phones) {
    await setHtml(p, `<html><head><style>${css}</style></head><body><div class="phone"><div class="scr" style="background-image:url(${u(path.join(shots, "mobile", k + "-f.jpg"))})"><div class="gloss"></div></div></div></body></html>`);
    await p.waitForTimeout(150); await p.screenshot({ path: `${out}/phone-${k}.png`, omitBackground: true }); n++;
  } await p.close(); }
{ const p = await page(1440, 936, 1.25);
  for (const k of wins) {
    await setHtml(p, `<html><head><link rel="stylesheet" href="${fonts}"><style>${css}</style></head><body><div class="win"><div class="bar"><i style="background:#e0605a"></i><i style="background:#e5bf56"></i><i style="background:#45bd5c"></i><span>Grow|Observer</span></div><div class="shot" style="background-image:url(${u(path.join(shots, "desktop", "d-" + k + ".jpg"))})"></div></div></body></html>`);
    await p.waitForTimeout(150); await p.screenshot({ path: `${out}/browser-${k}.png`, omitBackground: true }); n++;
  } await p.close(); }
await br.close(); console.log("wrote", n, "mockups");
