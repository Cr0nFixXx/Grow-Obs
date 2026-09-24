import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenPayload {
  sub: string; // user id
  role: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_TTL)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as TokenPayload;
}
