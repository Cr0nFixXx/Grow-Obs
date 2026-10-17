import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client.ts";
import { communityBans, communityMembers, posts } from "../db/schema.ts";

export type CommunityRole = "member" | "moderator" | "admin";

/** Community-Rolle der Person – `null`, wenn sie kein Mitglied ist. */
export async function communityRole(communityId: string, userId: string): Promise<CommunityRole | null> {
  const [row] = await db.select({ role: communityMembers.role }).from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).limit(1);
  return row?.role ?? null;
}

export const isModerator = (role: CommunityRole | null | undefined): boolean => role === "moderator" || role === "admin";

export async function isBanned(communityId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: communityBans.userId }).from(communityBans)
    .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId))).limit(1);
  return !!row;
}

/**
 * Lädt einen Beitrag mit Zugriffsprüfung. Beiträge einer Community sind nur für Mitglieder sichtbar (sonst 404 – kein Hinweis auf die
 * Existenz); ausgeblendete nur für Moderatoren/Admins der Community. Beiträge ohne Community (globaler Feed) sind für alle Angemeldeten sichtbar.
 */
export async function loadPostForViewer(postId: string, viewerId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new HTTPException(404, { message: "Beitrag nicht gefunden" });
  if (!post.communityId) return { post, role: null as CommunityRole | null, moderator: false };
  const role = await communityRole(post.communityId, viewerId);
  if (!role) throw new HTTPException(404, { message: "Beitrag nicht gefunden" });
  const moderator = isModerator(role);
  if (post.hiddenAt && !moderator) throw new HTTPException(404, { message: "Beitrag nicht gefunden" });
  return { post, role, moderator };
}
