/**
 * Version dieses Client-Bundles (zur Build-Zeit eingebettet, siehe next.config.ts).
 * Literal-Zugriffe nötig, damit Next.js ersetzen kann; im Vite-Legacy-Build existiert `process` nicht.
 */
function read(fn: () => string | undefined, fallback: string): string {
  try { return fn() || fallback; } catch { return fallback; }
}

export const APP_VERSION = read(() => process.env.NEXT_PUBLIC_APP_VERSION, "dev");
export const APP_BUILD = read(() => process.env.NEXT_PUBLIC_APP_BUILD, "dev");
export const APP_BUILT_AT = read(() => process.env.NEXT_PUBLIC_APP_BUILT_AT, new Date(0).toISOString());

/** Kurzform für die Anzeige: „0.50.0 · k3x9a1“. */
export const versionLabel = (version = APP_VERSION, build = APP_BUILD) => `${version} · ${build.slice(-6)}`;
