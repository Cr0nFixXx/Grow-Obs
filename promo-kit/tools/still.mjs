// Renders single stills of a scene at given times (seconds) – for previews and key visuals.
//   node tools/still.mjs --scene scenes/promo-60s.json --t 2,5.5,12 --out $PM/test [--png] [--prefix name]
// Writes <out>/<prefix>t<time>.jpg (or .png with --png; PNG = lossless, use for deliverables).
import fs from "fs";
import { args, loadScene, openPage } from "./lib.mjs";
const a = args();
const sc = loadScene(a.scene || "scenes/promo-60s.json");
const out = a.out; if (!out) throw new Error("--out <dir> required");
fs.mkdirSync(out, { recursive: true });
const { br, page } = await openPage(sc);
for (const ts of String(a.t || "1").split(",")) {
  const t = parseFloat(ts);
  await page.evaluate((x) => window.renderFrame(x), t);
  const name = `${out}/${a.prefix || ""}t${ts.replace(".", "_")}.${a.png ? "png" : "jpg"}`;
  await page.screenshot(a.png ? { path: name, type: "png" } : { path: name, type: "jpeg", quality: 88 });
  console.log("wrote", name);
}
await br.close();
