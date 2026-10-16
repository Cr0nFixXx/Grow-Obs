import versionConfig from "../../version.json";

/**
 * Versionierung des Frontends. Quelle: `version.json` im Repo-Root (zentral, siehe scripts/version.mjs).
 * Versionen vergibt der Projekteigner; die Build-Nummer (YYMMDDHH, Europe/Berlin) setzt `npm run version:build`.
 */
type ModuleEntry = { version?: string };
const config = versionConfig as {
  frontend: { codename: string; version: string };
  backend: { version: string };
  build: string;
  modules: Record<string, ModuleEntry | string>;
};

export const APP_CODENAME: string = config.frontend.codename;
export const FRONTEND_VERSION: string = config.frontend.version;
export const BACKEND_VERSION: string = config.backend.version;
/** Build-Nummer im Format YYMMDDHH (Europe/Berlin). */
export const BUILD_NUMBER: string = config.build;

/**
 * Version eines einzelnen Moduls (Vorbereitung): Ein Eintrag `"frontend.<modul>": { "version": "x.y.z" }` in
 * `version.json` überschreibt; ohne Eintrag erbt das Modul die Version der Hauptkomponente.
 */
export function moduleVersion(component: "frontend" | "backend", name: string): string {
  const entry = config.modules[`${component}.${name}`];
  const own = typeof entry === "object" && entry ? entry.version : undefined;
  return own ?? (component === "frontend" ? FRONTEND_VERSION : BACKEND_VERSION);
}

/**
 * Laufzeit-Kennung dieses Bundles für die Update-Erkennung (zufällig je Build, siehe next.config.ts).
 * Bewusst getrennt von BUILD_NUMBER: zwei Builds in derselben Stunde haben dieselbe Build-Nummer,
 * müssen aber als „neuer“ erkannt werden. Literal-Zugriffe nötig, damit Next.js ersetzen kann;
 * im Vite-Legacy-Build existiert `process` nicht.
 */
function read(fn: () => string | undefined, fallback: string): string {
  try { return fn() || fallback; } catch { return fallback; }
}

/** Version dieses Frontends (Alias; bisherige Importe bleiben gültig). */
export const APP_VERSION = FRONTEND_VERSION;
export const APP_BUILD = read(() => process.env.NEXT_PUBLIC_APP_BUILD, "dev");
export const APP_BUILT_AT = read(() => process.env.NEXT_PUBLIC_APP_BUILT_AT, new Date(0).toISOString());

/** Anzeige: „Ruderalis v0.1.1 · Build 26101602“. */
export const versionLabel = (version = FRONTEND_VERSION, build = BUILD_NUMBER) => `${APP_CODENAME} v${version} · Build ${build}`;
