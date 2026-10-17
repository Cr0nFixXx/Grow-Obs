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
