import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

const issuer = "grow-observer-api";
const audience = "grow-observer-web";
const claimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(["member", "moderator", "admin", "platform_admin"]),
});
export type TokenPayload = z.infer<typeof claimsSchema>;

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...claimsSchema.parse(payload) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(env.JWT_TTL)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"], issuer, audience, requiredClaims: ["exp", "iat", "sub"],
  });
  return claimsSchema.parse(payload);
}
