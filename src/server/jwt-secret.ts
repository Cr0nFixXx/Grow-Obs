import { randomBytes } from "node:crypto";

export type JwtSecretResult =
  | { ok: true; secret: string; ephemeral: boolean }
  | { ok: false; reason: string };

/**
 * Bestimmt das JWT-Secret der eingebetteten API.
 * - Gesetzt (≥ 32 Zeichen): wird verwendet.
 * - Fehlt es in Produktion: Fehler (sonst enden Sessions bei jedem Neustart und mehrere Instanzen
 *   würden sich gegenseitig ungültig machen). Opt-out nur bewusst über `ALLOW_EPHEMERAL_JWT_SECRET=true`.
 * - Fehlt es in Entwicklung/Test: temporäres Zufalls-Secret.
 */
export function resolveJwtSecret(env: Record<string, string | undefined>): JwtSecretResult {
  const configured = env.JWT_SECRET;
  if (configured) return { ok: true, secret: configured, ephemeral: false };
  const production = env.NODE_ENV === "production";
  if (production && env.ALLOW_EPHEMERAL_JWT_SECRET !== "true") {
    return { ok: false, reason: "JWT_SECRET fehlt (Produktion). Setzen mit: openssl rand -base64 48 – oder bewusst ALLOW_EPHEMERAL_JWT_SECRET=true." };
  }
  return { ok: true, secret: randomBytes(48).toString("base64url"), ephemeral: true };
}
