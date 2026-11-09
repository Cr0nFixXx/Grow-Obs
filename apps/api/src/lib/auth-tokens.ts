import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { authTokens } from "../db/schema.ts";

export type TokenKind = typeof authTokens.$inferSelect.kind;

/** Gültigkeit je Art: Reset kurz (1 Stunde), Bestätigungen 24 Stunden. */
export const TOKEN_TTL_MS: Record<TokenKind, number> = {
  reset_password: 60 * 60 * 1000,
  verify_email: 24 * 60 * 60 * 1000,
  change_email: 24 * 60 * 60 * 1000,
};

const hashToken = (token: string) => createHash("sha256").update(`go-auth:${token}`).digest("hex");

/**
 * Erzeugt einen Einmal-Link-Token. Gespeichert wird nur der Hash; frühere offene Tokens derselben Art (und bei
 * Bestätigungen: derselben Adresse) werden ungültig – es gilt immer nur der zuletzt verschickte Link.
 */
export async function issueToken(userId: string, kind: TokenKind, newEmail?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.delete(authTokens).where(or(lt(authTokens.expiresAt, new Date()), and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt))));
  await db.insert(authTokens).values({
    userId, kind, tokenHash: hashToken(token), newEmail: newEmail ?? null, expiresAt: new Date(Date.now() + TOKEN_TTL_MS[kind]),
  });
  return token;
}

/** Löst einen Token atomar ein (einmalig, nicht abgelaufen, passende Art). `null` bei jedem Fehler – ohne Unterscheidung. */
export async function consumeToken(token: string, kinds: TokenKind[]): Promise<{ userId: string; kind: TokenKind; newEmail: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(
      eq(authTokens.tokenHash, hashToken(token)), isNull(authTokens.usedAt), sql`${authTokens.expiresAt} > now()`,
      or(...kinds.map((kind) => eq(authTokens.kind, kind))),
    ))
    .returning({ userId: authTokens.userId, kind: authTokens.kind, newEmail: authTokens.newEmail });
  return row ?? null;
}

/** Macht alle offenen Tokens einer Art eines Kontos ungültig (z. B. Reset-Links nach Passwort- oder Adresswechsel). */
export async function revokeTokens(userId: string, kinds: TokenKind[]): Promise<void> {
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt), or(...kinds.map((kind) => eq(authTokens.kind, kind)))));
}
