// Renders a scene to numbered JPG frames (deterministic: frame f shows time f/fps).
//   node tools/render.mjs --scene scenes/promo-60s.json --out $PM/frames [--from 0] [--to N] [--q 90]
// Existing frames are skipped (resume). If the page crashes (renderer OOM) it is reopened and the frame retried.
// Run two workers on different ranges in parallel (build.sh does that). Env: SHOTS = screenshots folder.
import fs from "fs";
import { args, loadScene, openPage } from "./lib.mjs";
const a = args();
const sc = loadScene(a.scene || "scenes/promo-60s.json");
const dir = a.out; if (!dir) throw new Error("--out <dir> required");
fs.mkdirSync(dir, { recursive: true });
const from = +(a.from || 0), to = +(a.to || sc.frames), q = +(a.q || 90);
let h = await openPage(sc);
const t0 = Date.now();
for (let f = from; f < to; f++) {
  const file = `${dir}/f${String(f).padStart(5, "0")}.jpg`;
  if (fs.existsSync(file)) continue;
  for (let attempt = 0; ; attempt++) {
    try {
      await h.page.evaluate((t) => window.renderFrame(t), f / sc.fps);
      await h.page.screenshot({ path: file + ".tmp", type: "jpeg", quality: q, timeout: 60000 });
      fs.renameSync(file + ".tmp", file); break;
    } catch (e) {
      console.log("RETRY", f, e.message.split("\n")[0]);
      if (attempt >= 4) throw e;
      try { await h.br.close() } catch {}
      h = await openPage(sc);
    }
  }
  if ((f - from) % 30 === 0) console.log("frame", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
await h.br.close();
