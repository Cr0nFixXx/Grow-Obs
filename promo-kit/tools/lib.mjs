// Shared helpers for render.mjs / still.mjs: opens engine/index.html in headless Chromium with a scene injected.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function args(argv = process.argv.slice(2)) {
  const o = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); o[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true }
  return o;
}
export function loadScene(p) {
  const file = path.resolve(p); const scene = JSON.parse(fs.readFileSync(file, "utf8"));
  const dur = scene.stations.reduce((a, s) => a + s.dur, 0), fps = (scene.format && scene.format.fps) || 30;
  return { scene, dur, fps, frames: Math.round(dur * fps), w: (scene.format && scene.format.w) || 1920, h: (scene.format && scene.format.h) || 1080 };
}
export async function openPage(sc, { transparent = false } = {}) {
  const shots = process.env.SHOTS || path.join(KIT, "screenshots");
  const url = new URL(pathToFileURL(path.join(KIT, "engine/index.html")).href);
  url.searchParams.set("assets", pathToFileURL(shots).href + "/");
  const br = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] });
  const page = await br.newPage({ viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: 1 });
  await page.addInitScript((s) => { window.__SCENE__ = s }, sc.scene);
  page.on("pageerror", (e) => console.log("PAGEERR", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) console.log("CONSOLE", m.text()) });
  await page.goto(url.href);
  await page.evaluate(() => window.ready);
  await page.evaluate(() => document.fonts.ready);
  return { br, page };
}
