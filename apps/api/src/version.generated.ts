// GENERIERT von scripts/version.mjs aus version.json – nicht von Hand ändern (npm run version:sync).
export const BACKEND_VERSION = "0.0.2";
export const BUILD_NUMBER = "26102003";
/** Versionen einzelner Backend-Module; ohne Eintrag gilt BACKEND_VERSION. */
export const BACKEND_MODULE_VERSIONS: Readonly<Record<string, string>> = {};
export const moduleVersion = (name: string): string => BACKEND_MODULE_VERSIONS[name] ?? BACKEND_VERSION;
