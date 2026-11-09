import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { conversationMembers, conversations, users } from "../db/schema.ts";
import { removeObjects, usedBy } from "./media-cleanup.ts";
import { announceGroupChange, repairAfterDeparture } from "./chat-groups.ts";

/**
 * Konto löschen (B-74). Das Mitglied entscheidet je Bereich, ob seine Inhalte gelöscht werden oder anonym stehen bleiben.
 * Immer entfernt: Zugang, Sitzungen, Push-Geräte, Benachrichtigungen, Follows, Likes/Stimmen/Lesezeichen, Aufgaben, Sammlung,
 * Grows samt Fotos/Logs/Messwerte, Gruppen-/Community-Mitgliedschaften, Profildaten. Bleiben Inhalte stehen (oder hängen
 * Antworten anderer daran), bleibt die Konto-Zeile als anonyme Hülle „Gelöschtes Mitglied“ ohne Zugang erhalten.
 */
export const DELETED_NAME = "Gelöschtes Mitglied";
/** Platzhalter für Inhalte, auf die andere geantwortet haben: der Text verschwindet, der Faden bleibt lesbar. */
export const DELETED_TEXT = "[gelöscht]";
export const DELETE_CONFIRM_WORD = "LÖSCHEN";

const choice = z.enum(["delete", "keep"]);
export const deleteOptionsSchema = z.object({
  forum: choice, feed: choice, comments: choice, chat: choice,
  /** Bilder und Dateien in Inhalten, die stehen bleiben (Feed-Bilder, Chat-Anhänge): entfernen oder behalten. */
  media: z.enum(["remove", "keep"]),
}).strict();
export type DeleteOptions = z.infer<typeof deleteOptionsSchema>;

export interface AccountBlockers {
  platformAdmin: boolean;
  communities: { id: string; name: string }[];
  groups: { id: string; name: string }[];
}

/** Gründe, die das Löschen verhindern: letzter Plattform-Admin, alleiniger Admin einer Community oder Gruppe mit weiteren Mitgliedern. */
export async function accountBlockers(userId: string): Promise<AccountBlockers> {
  const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  let platformAdmin = false;
  if (me?.role === "platform_admin") {
    const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from users where role = 'platform_admin' and deleted_at is null and id <> ${userId}`);
    platformAdmin = (row?.n ?? 0) === 0;
  }
  const communities = await db.execute<{ id: string; name: string }>(sql`
    select c.id, c.name from community_members cm join communities c on c.id = cm.community_id
    where cm.user_id = ${userId} and cm.role = 'admin'
      and exists (select 1 from community_members o where o.community_id = cm.community_id and o.user_id <> cm.user_id)
      and not exists (select 1 from community_members o where o.community_id = cm.community_id and o.user_id <> cm.user_id and o.role = 'admin')
    order by c.name`);
  const groups = await db.execute<{ id: string; name: string }>(sql`
    select c.id, c.name from conversation_members cm join conversations c on c.id = cm.conversation_id and c.is_group
    where cm.user_id = ${userId} and cm.role = 'admin'
      and exists (select 1 from conversation_members o where o.conversation_id = cm.conversation_id and o.user_id <> cm.user_id)
      and not exists (select 1 from conversation_members o where o.conversation_id = cm.conversation_id and o.user_id <> cm.user_id and o.role = 'admin')
    order by c.name`);
  return { platformAdmin, communities: [...communities], groups: [...groups] };
}

export const isBlocked = (b: AccountBlockers): boolean => b.platformAdmin || b.communities.length > 0 || b.groups.length > 0;

export interface DeleteResult { mode: "removed" | "anonymized"; mediaDeleted: number }

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function removeAccountData(tx: Tx, userId: string, o: DeleteOptions): Promise<{ keys: string[]; count: number }> {
  const U = userId;
  const groupIds = (await tx.execute<{ id: string }>(sql`select c.id from conversation_members cm join conversations c on c.id = cm.conversation_id and c.is_group where cm.user_id = ${U}`)).map((r) => r.id);

  // 1) Immer: Zugang, Geräte, Beziehungen, Stimmen, Persönliches
  await tx.execute(sql`delete from post_likes where user_id = ${U}`);
  await tx.execute(sql`delete from post_bookmarks where user_id = ${U}`);
  await tx.execute(sql`delete from thread_votes where user_id = ${U}`);
  await tx.execute(sql`delete from comment_votes where user_id = ${U}`);
  await tx.execute(sql`delete from notifications where user_id = ${U}`);
  await tx.execute(sql`delete from push_subscriptions where user_id = ${U}`);
  await tx.execute(sql`delete from push_prefs where user_id = ${U}`);
  await tx.execute(sql`delete from sessions where user_id = ${U}`);
  await tx.execute(sql`delete from auth_tokens where user_id = ${U}`);
  await tx.execute(sql`delete from login_events where user_id = ${U}`);
  await tx.execute(sql`delete from follows where follower_id = ${U} or followee_id = ${U}`);
  await tx.execute(sql`delete from tasks where user_id = ${U}`);
  await tx.execute(sql`delete from strain_collection where user_id = ${U}`);
  await tx.execute(sql`delete from community_bans where user_id = ${U}`);
  await tx.execute(sql`delete from reports where reporter_id = ${U}`);
  await tx.execute(sql`delete from topic_members where user_id = ${U}`);
  await tx.execute(sql`delete from topic_user_state where user_id = ${U}`);
  await tx.execute(sql`delete from conversation_invites where invitee_id = ${U} or inviter_id = ${U}`);

  // 2) Grows (immer gelöscht); die Bilder räumt die Medien-Bereinigung am Ende auf
  await tx.execute(sql`delete from grow_env where grow_id in (select id from grows where user_id = ${U})`);
  await tx.execute(sql`delete from grow_logs where grow_id in (select id from grows where user_id = ${U})`);
  await tx.execute(sql`delete from grow_photos where grow_id in (select id from grows where user_id = ${U})`);
  await tx.execute(sql`delete from grows where user_id = ${U}`);

  // 3) Kommentare an Beiträgen und Hall of Fame
  if (o.comments === "delete") {
    await tx.execute(sql`delete from reports where kind = 'comment' and target_id in (select id from item_comments where user_id = ${U})`);
    await tx.execute(sql`delete from item_comments where user_id = ${U}`);
  }

  // 4) Feed: Beiträge ohne verbleibende Kommentare verschwinden, die übrigen werden zur leeren Hülle
  if (o.feed === "delete") {
    const hasComments = sql`exists (select 1 from item_comments ic where ic.kind = 'post' and ic.item_id = posts.id)`;
    await tx.execute(sql`update posts set text = ${DELETED_TEXT}, image_url = null, tags = '[]'::jsonb where user_id = ${U} and ${hasComments}`);
    const gone = sql`select id from posts where user_id = ${U} and not ${hasComments}`;
    await tx.execute(sql`delete from reports where kind = 'post' and target_id in (${gone})`);
    await tx.execute(sql`delete from post_likes where post_id in (${gone})`);
    await tx.execute(sql`delete from post_bookmarks where post_id in (${gone})`);
    await tx.execute(sql`delete from posts where id in (${gone})`);
  } else if (o.media === "remove") {
    await tx.execute(sql`update posts set image_url = null where user_id = ${U} and image_url is not null`);
  }

  // 5) Forum: Antworten und Threads, auf die niemand geantwortet hat, verschwinden; alles andere wird zur leeren Hülle
  if (o.forum === "delete") {
    for (let round = 0; round < 50; round += 1) {
      const leaves = (await tx.execute<{ id: string }>(sql`select c.id from comments c where c.user_id = ${U} and not exists (select 1 from comments ch where ch.parent_id = c.id)`)).map((r) => r.id);
      if (!leaves.length) break;
      await tx.execute(sql`delete from comment_votes where comment_id in ${leaves}`);
      await tx.execute(sql`delete from comments where id in ${leaves}`);
    }
    await tx.execute(sql`update comments set body = ${DELETED_TEXT} where user_id = ${U}`);
    const empty = sql`select t.id from threads t where t.user_id = ${U} and not exists (select 1 from comments c where c.thread_id = t.id)`;
    await tx.execute(sql`delete from thread_votes where thread_id in (${empty})`);
    await tx.execute(sql`delete from threads where id in (${empty})`);
    await tx.execute(sql`update threads set title = ${DELETED_TEXT}, body = '' where user_id = ${U}`);
  }

  // 6) Chat: wie „Nachricht löschen“ (Platzhalter „Nachricht gelöscht“); bleibende Nachrichten verlieren auf Wunsch ihre Anhänge
  if (o.chat === "delete") {
    await tx.execute(sql`update messages set text = '', image_url = null, attachments = '[]'::jsonb, deleted_at = now() where sender_id = ${U} and kind = 'user' and deleted_at is null`);
  } else if (o.media === "remove") {
    await tx.execute(sql`update messages set image_url = null, attachments = '[]'::jsonb where sender_id = ${U} and kind = 'user' and deleted_at is null and (image_url is not null or attachments <> '[]'::jsonb)`);
    await tx.execute(sql`update messages set deleted_at = now() where sender_id = ${U} and kind = 'user' and deleted_at is null and text = ''`);
  }

  // 7) Mitgliedschaften: Gruppen verlassen (Direktchats bleiben beim Gegenüber), Communities verlassen
  if (groupIds.length) {
    await tx.execute(sql`delete from topic_members where user_id = ${U}`);
    await tx.execute(sql`delete from conversation_members where user_id = ${U} and conversation_id in ${groupIds}`);
  }
  await tx.execute(sql`delete from community_members where user_id = ${U}`);

  // 8) Konto anonymisieren (auch Bilder des Profils fallen damit aus der Verwendung)
  const handle = `geloescht_${U.replace(/-/g, "").slice(0, 12)}`;
  await tx.update(users).set({
    name: DELETED_NAME, handle, email: `${handle}@geloescht.invalid`, passwordHash: "!geloescht",
    avatarUrl: null, coverUrl: null, bio: "", location: "", growSince: null, medium: null, interests: [], title: "Grower", level: 1,
    telegram: false, weeklyReport: false, weeklyReportWeek: null, growReminderDays: null, profileVisibility: "nobody",
    role: "member", mustChangePassword: false, emailVerifiedAt: null, onlineUntil: null, deletedAt: new Date(),
  }).where(eq(users.id, U));

  // 9) Dateien: alles, was nirgends mehr verwendet wird (Grow-Fotos, gelöschte Beiträge, entfernte Anhänge), sofort löschen
  const unused = await tx.execute<{ id: string; storage_key: string | null }>(sql`
    select m.id, m.storage_key from media m where m.owner_id = ${U} and not (${usedBy(sql`m.id::text`)})`);
  const ids = unused.map((m) => m.id);
  if (ids.length) await tx.execute(sql`delete from media where id in ${ids}`);
  return { keys: unused.flatMap((m) => (m.storage_key ? [m.storage_key] : [])), count: ids.length };
}

/**
 * Führt das Löschen in EINER Transaktion aus. Danach: Objekte im Bucket entfernen, Gruppen reparieren (ältestes Mitglied wird
 * Admin, leere Gruppe verschwindet) und – wenn nichts mehr an der Konto-Zeile hängt – die Hülle ganz löschen.
 */
export async function deleteAccount(userId: string, options: DeleteOptions): Promise<DeleteResult> {
  const groupIds = (await db.select({ id: conversations.id }).from(conversationMembers)
    .innerJoin(conversations, and(eq(conversations.id, conversationMembers.conversationId), eq(conversations.isGroup, true)))
    .where(eq(conversationMembers.userId, userId))).map((r) => r.id);
  const { keys, count, mode } = await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).for("update");
    if (!row) throw new Error("account_gone");
    const removed = await removeAccountData(tx, userId, options);
    // Hängt nichts mehr an der Zeile (keine Nachrichten, Beiträge, Gruppen …) und besitzt sie keine Dateien mehr, wird sie ganz gelöscht.
    let removedCompletely = false;
    const [owned] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from media where owner_id = ${userId}`);
    if ((owned?.n ?? 0) === 0) {
      try {
        await tx.transaction(async (inner) => { await inner.delete(users).where(eq(users.id, userId)); });
        removedCompletely = true;
      } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
        if (code !== "23503") throw error;
      }
    }
    return { keys: removed.keys, count: removed.count, mode: removedCompletely ? "removed" as const : "anonymized" as const };
  });
  await removeObjects(keys);
  for (const id of groupIds) {
    const result = await repairAfterDeparture(id).catch(() => null);
    if (result && !result.deleted) {
      const rest = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, id));
      await announceGroupChange(id, rest.map((m) => m.userId)).catch(() => undefined);
    }
  }
  return { mode, mediaDeleted: count };
}
