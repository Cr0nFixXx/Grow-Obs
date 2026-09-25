import path from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { NextConfig } from "next";

/**
 * Next.js-Hülle für die SPA (app/page.tsx) + eingebettete Self-Host-API (app/api/[...route]).
 * `@/*` wird über tsconfig.json paths aufgelöst ("@/*" → "src/*").
 */
/**
 * Versionskennung (B-50): einmal pro Build erzeugt, in Client + Server eingebettet und als Next-Build-ID
 * verwendet. Der Client vergleicht seine ID mit `/api/version` → Update erkannt.
 * `APP_BUILD_ID` erlaubt eine feste ID (z. B. Git-SHA in CI).
 */
const APP_VERSION: string = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
// Next wertet die Config pro Build mehrfach aus (Haupt- und Worker-Prozesse). Die erste Auswertung legt
// ID + Zeit in process.env ab; spätere Auswertungen/Worker erben sie → Client, Server und BUILD_ID stimmen überein.
process.env.APP_BUILD_ID = (process.env.APP_BUILD_ID || `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`).replace(/[^a-zA-Z0-9_-]/g, "");
process.env.APP_BUILT_AT ||= new Date().toISOString();
const BUILD_ID = process.env.APP_BUILD_ID;
const BUILT_AT = process.env.APP_BUILT_AT;

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  reactStrictMode: true,
  // apps/api hat einen eigenen Lockfile → Workspace-Root explizit festlegen.
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
  // Native/Node-only Pakete der API nicht bündeln.
  serverExternalPackages: ["argon2", "postgres"],
  env: {
    // Standard: eingebettete API (same-origin). `NEXT_PUBLIC_API_URL=` (leer) → Demo-/Mock-Modus,
    // `NEXT_PUBLIC_API_URL=https://api.example.com` → externe API (Docker-Stack).
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_APP_BUILD: BUILD_ID,
    NEXT_PUBLIC_APP_BUILT_AT: BUILT_AT,
  },
};

export default nextConfig;
