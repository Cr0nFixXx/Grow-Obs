import { readFileSync } from "node:fs";
import path from "node:path";
import versionConfig from "../../../version.json";

/**
 * Version der laufenden Server-Instanz (B-50). Der Client vergleicht `build` mit seiner eingebetteten ID.
 * `build` = Laufzeit-ID aus `.next/BUILD_ID` (maßgeblich für Update-Erkennung, wechselt bei jedem Build).
 * `buildNumber` = Anzeige-Build (YYMMDDHH, Europe/Berlin) aus `version.json`; `backend` = Backend-Version.
 */
export const dynamic = "force-dynamic";

let cachedBuild: string | null = null;
function currentBuild(): string {
  if (cachedBuild) return cachedBuild;
  try {
    cachedBuild = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cachedBuild = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";
  }
  return cachedBuild;
}

export function GET() {
  return Response.json(
    {
      version: versionConfig.frontend.version,
      codename: versionConfig.frontend.codename,
      backend: { version: versionConfig.backend.version },
      buildNumber: versionConfig.build,
      build: currentBuild(),
      builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
