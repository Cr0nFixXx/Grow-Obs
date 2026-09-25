#!/usr/bin/env node
/**
 * Prüft, ob alle Pflicht-Peers der direkten Abhängigkeiten installiert sind.
 * Nötig, weil `.npmrc` `legacy-peer-deps=true` setzt (Workaround für den npm-10-Absturz
 * `edgesOut` bei den optionalen vitest-Peers) – npm installiert Peers dann nicht mehr automatisch.
 * Aufruf: `npm run check:peers` (auch in der CI).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const direct = { ...pkg.dependencies, ...pkg.devDependencies };
const missing = [];

for (const name of Object.keys(direct)) {
  let meta;
  try { meta = require(`${name}/package.json`); } catch { continue; }
  const optional = meta.peerDependenciesMeta ?? {};
  for (const [peer, range] of Object.entries(meta.peerDependencies ?? {})) {
    if (optional[peer]?.optional) continue;
    try { require.resolve(`${peer}/package.json`); } catch { missing.push(`${peer}@${range} (benötigt von ${name})`); }
  }
}

if (missing.length) {
  console.error(`Fehlende Pflicht-Peers:\n  ${missing.join("\n  ")}\n→ explizit als (dev)Dependency installieren.`);
  process.exit(1);
}
console.log("check:peers – alle Pflicht-Peers vorhanden.");
