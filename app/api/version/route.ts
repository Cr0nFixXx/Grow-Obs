import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Version der laufenden Server-Instanz (B-50). Der Client vergleicht `build` mit seiner eingebetteten ID.
 * Build-ID aus `.next/BUILD_ID` (maßgeblich für den laufenden Build), Fallback: eingebetteter Wert.
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
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev", build: currentBuild(), builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
