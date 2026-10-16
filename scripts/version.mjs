#!/usr/bin/env node
/**
 * Zentrale Versionssteuerung (Quelle: `version.json` im Repo-Root).
 *
 *   node scripts/version.mjs sync                 – schreibt Versionen in package.json/Lockfiles + apps/api/src/version.generated.ts
 *   node scripts/version.mjs check                – Exit 1, wenn irgendeine Datei von version.json abweicht (CI)
 *   node scripts/version.mjs build [--date ISO]   – setzt die Build-Nummer (YYMMDDHH, Europe/Berlin) und synchronisiert
 *   node scripts/version.mjs print-build [--date] – gibt die Build-Nummer aus, ohne Dateien zu ändern
 *   node scripts/version.mjs show                 – zeigt die aktuelle Versionierung
 *
 * Versionen (frontend/backend/codename) werden hier bewusst NICHT per Kommando erhöht: Sie vergibt der Projekteigner.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => path.join(root, p);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** YYMMDDHH in Europe/Berlin (inkl. Sommer-/Winterzeit). */
export function buildNumber(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}${parts.hour}`;
}

/** Prüft, ob `YYMMDDHH` ein gültiges Datum/Stunde ist. */
export function isValidBuild(build) {
  if (!/^\d{8}$/.test(build)) return false;
  const [yy, mm, dd, hh] = [0, 2, 4, 6].map((i) => Number(build.slice(i, i + 2)));
  const days = new Date(2000 + yy, mm, 0).getDate();
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= days && hh <= 23;
}

function readJson(p) { return JSON.parse(readFileSync(file(p), "utf8")); }
function writeJson(p, data) { writeFileSync(file(p), `${JSON.stringify(data, null, 2)}\n`); }

export function loadConfig() {
  const cfg = readJson("version.json");
  const problems = [];
  if (!cfg.frontend?.codename || typeof cfg.frontend.codename !== "string") problems.push("frontend.codename fehlt");
  if (!SEMVER.test(cfg.frontend?.version ?? "")) problems.push(`frontend.version ungültig: ${cfg.frontend?.version}`);
  if (!SEMVER.test(cfg.backend?.version ?? "")) problems.push(`backend.version ungültig: ${cfg.backend?.version}`);
  if (!isValidBuild(cfg.build ?? "")) problems.push(`build ungültig (erwartet YYMMDDHH): ${cfg.build}`);
  for (const [key, value] of Object.entries(cfg.modules ?? {})) {
    if (key.startsWith("_")) continue;
    if (!/^(frontend|backend)\.[a-z0-9-]+$/.test(key)) problems.push(`Modul-Schlüssel ungültig: ${key}`);
    else if (!SEMVER.test(value?.version ?? "")) problems.push(`Modul ${key}: version ungültig`);
  }
  if (problems.length) throw new Error(`version.json fehlerhaft:\n - ${problems.join("\n - ")}`);
  return cfg;
}

/** Inhalt der generierten Backend-Datei (das Docker-Image sieht nur `apps/api/`, daher kein Import aus dem Root). */
export function generatedBackendSource(cfg) {
  const modules = Object.fromEntries(
    Object.entries(cfg.modules ?? {}).filter(([key]) => key.startsWith("backend.")).map(([key, v]) => [key.slice("backend.".length), v.version]),
  );
  return `// GENERIERT von scripts/version.mjs aus version.json – nicht von Hand ändern (npm run version:sync).
export const BACKEND_VERSION = ${JSON.stringify(cfg.backend.version)};
export const BUILD_NUMBER = ${JSON.stringify(cfg.build)};
/** Versionen einzelner Backend-Module; ohne Eintrag gilt BACKEND_VERSION. */
export const BACKEND_MODULE_VERSIONS: Readonly<Record<string, string>> = ${JSON.stringify(modules)};
export const moduleVersion = (name: string): string => BACKEND_MODULE_VERSIONS[name] ?? BACKEND_VERSION;
`;
}

/** Soll-Zustand aller abgeleiteten Dateien. */
function targets(cfg) {
  const out = [];
  const pkgTargets = [
    ["package.json", cfg.frontend.version, (d, v) => { d.version = v; }],
    ["package-lock.json", cfg.frontend.version, (d, v) => { d.version = v; if (d.packages?.[""]) d.packages[""].version = v; }],
    ["apps/api/package.json", cfg.backend.version, (d, v) => { d.version = v; }],
    ["apps/api/package-lock.json", cfg.backend.version, (d, v) => { d.version = v; if (d.packages?.[""]) d.packages[""].version = v; }],
  ];
  for (const [p, version, apply] of pkgTargets) {
    if (!existsSync(file(p))) continue;
    const before = readJson(p);
    const after = structuredClone(before);
    apply(after, version);
    out.push({ path: p, ok: JSON.stringify(before) === JSON.stringify(after), write: () => writeJson(p, after) });
  }
  const generatedPath = "apps/api/src/version.generated.ts";
  const wanted = generatedBackendSource(cfg);
  const current = existsSync(file(generatedPath)) ? readFileSync(file(generatedPath), "utf8") : null;
  out.push({ path: generatedPath, ok: current === wanted, write: () => writeFileSync(file(generatedPath), wanted) });
  return out;
}

export function check() {
  const cfg = loadConfig();
  return targets(cfg).filter((t) => !t.ok).map((t) => t.path);
}

export function sync() {
  const cfg = loadConfig();
  const changed = [];
  for (const t of targets(cfg)) if (!t.ok) { t.write(); changed.push(t.path); }
  return changed;
}

function describe(cfg) {
  return `Frontend "${cfg.frontend.codename}" v${cfg.frontend.version} · Backend v${cfg.backend.version} · Build ${cfg.build}`;
}

function dateArg(argv) {
  const i = argv.indexOf("--date");
  if (i === -1) return new Date();
  const d = new Date(argv[i + 1]);
  if (Number.isNaN(d.getTime())) throw new Error(`--date ungültig: ${argv[i + 1]}`);
  return d;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command = "show", ...rest] = process.argv.slice(2);
  try {
    if (command === "check") {
      const drift = check();
      if (drift.length) { console.error(`Version-Drift gegenüber version.json in:\n - ${drift.join("\n - ")}\n→ \`npm run version:sync\``); process.exit(1); }
      console.log(`version:check ok – ${describe(loadConfig())}`);
    } else if (command === "sync") {
      const changed = sync();
      console.log(changed.length ? `synchronisiert: ${changed.join(", ")}` : "bereits synchron");
    } else if (command === "build") {
      const cfg = loadConfig();
      const next = buildNumber(dateArg(rest));
      if (next !== cfg.build) { cfg.build = next; writeJson("version.json", cfg); }
      sync();
      console.log(describe(loadConfig()));
    } else if (command === "print-build") {
      console.log(buildNumber(dateArg(rest)));
    } else if (command === "show") {
      console.log(describe(loadConfig()));
    } else {
      console.error(`Unbekanntes Kommando: ${command}`); process.exit(2);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error); process.exit(1);
  }
}
