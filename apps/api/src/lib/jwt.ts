import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../env.ts";

const secret = new TextEncoder().encode(env.JWT_SECRET);

const issuer = "grow-observer-api";
const audience = "grow-observer-web";
const claimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(["member", "moderator", "admin", "platform_admin"]),
  /** Sitzungs-ID (Tabelle `sessions`): ohne passende, nicht abgelaufene Zeile ist das Token wertlos. */
  sid: z.string().uuid(),
});
export type TokenPayload = z.infer<typeof claimsSchema>;

/** Signiert das Sitzungs-Token; es läuft zusammen mit der Sitzung ab (`expiresAt`). */
export async function signToken(payload: TokenPayload, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...claimsSchema.parse(payload) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], issuer, audience, requiredClaims: ["exp", "iat", "sub", "sid"],
  });
  return claimsSchema.parse(payload);
}

/** Einmal-Ticket für den Datenexport (B-74): 2 Minuten gültig, an Konto UND Sitzung gebunden. Der Download ist ein normaler Link-Aufruf. */
const exportAudience = "grow-observer-export";
export async function signExportTicket(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(exportAudience).setSubject(userId)
    .setIssuedAt().setExpirationTime("2m").sign(secret);
}
export async function verifyExportTicket(ticket: string): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(ticket, secret, { algorithms: ["HS256"], issuer, audience: exportAudience, requiredClaims: ["exp", "sub", "sid"] });
    return typeof payload.sub === "string" && typeof payload.sid === "string" ? { userId: payload.sub, sessionId: payload.sid } : null;
  } catch { return null; }
}
