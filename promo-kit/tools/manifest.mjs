// Regenerates manifest.json: inventory of every asset in the kit (path, bytes, pixel size for images).
import fs from "fs";
import path from "path";
import { KIT } from "./lib.mjs";
const dirs = ["screenshots", "stills", "mockups", "brand", "scenes", "engine", "audio", "tools", "docs"];
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(path.join(KIT, d), { withFileTypes: true })) { const p = d + "/" + e.name; e.isDirectory() ? walk(p) : files.push(p); } };
dirs.forEach(walk);
const dim = (f) => { try { const b = fs.readFileSync(path.join(KIT, f)); if (f.endsWith(".png")) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (/\.jpe?g$/.test(f)) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } } } catch {} return undefined; };
const out = files.sort().map((f) => ({ path: f, bytes: fs.statSync(path.join(KIT, f)).size, ...(dim(f) ? { size: dim(f).join("x") } : {}) }));
const total = out.reduce((a, x) => a + x.bytes, 0);
fs.writeFileSync(path.join(KIT, "manifest.json"), JSON.stringify({ generatedBy: "tools/manifest.mjs", totalBytes: total, files: out }, null, 1) + "\n");
console.log(out.length, "files,", (total / 1e6).toFixed(1), "MB");
