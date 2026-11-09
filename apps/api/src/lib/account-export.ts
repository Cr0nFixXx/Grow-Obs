import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  comments, communityMembers, communities, conversationMembers, conversations, follows, growEnv, growLogs, growPhotos, grows, itemComments,
  loginEvents, media, messages, notifications, postBookmarks, postLikes, posts, pushPrefs, sessions, strainCollection, tasks, threads, users,
} from "../db/schema.ts";
import { getObjectStream } from "./s3.ts";
import { sanitizeFileName } from "./media-files.ts";

/** Datenexport (B-74): alle eigenen Daten als JSON, dazu die hochgeladenen Dateien. Geheimnisse (Passwort-Hash, Push-Schlüssel) fehlen bewusst. */
export async function collectExport(userId: string) {
  const [profile] = await db.select().from(users).where(eq(users.id, userId));
  if (!profile) return null;
  const { passwordHash: _hash, deletedAt: _deleted, onlineUntil: _online, ...account } = profile;
  const myGrows = await db.select().from(grows).where(eq(grows.userId, userId));
  const [prefs] = await db.select().from(pushPrefs).where(eq(pushPrefs.userId, userId));
  const [
    sessionRows, loginRows, followRows, collectionRows, taskRows, postRows, likeRows, bookmarkRows, commentRows, threadRows, forumCommentRows,
    memberRows, messageRows, chatMemberRows, notificationRows, mediaRows,
  ] = await Promise.all([
    db.select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, device: sessions.userAgent }).from(sessions).where(eq(sessions.userId, userId)),
    db.select().from(loginEvents).where(eq(loginEvents.userId, userId)),
    db.select({ followerId: follows.followerId, followeeId: follows.followeeId, status: follows.status, createdAt: follows.createdAt }).from(follows).where(or(eq(follows.followerId, userId), eq(follows.followeeId, userId))),
    db.select().from(strainCollection).where(eq(strainCollection.userId, userId)),
    db.select().from(tasks).where(eq(tasks.userId, userId)),
    db.select().from(posts).where(eq(posts.userId, userId)),
    db.select().from(postLikes).where(eq(postLikes.userId, userId)),
    db.select().from(postBookmarks).where(eq(postBookmarks.userId, userId)),
    db.select().from(itemComments).where(eq(itemComments.userId, userId)),
    db.select().from(threads).where(eq(threads.userId, userId)),
    db.select().from(comments).where(eq(comments.userId, userId)),
    db.select({ communityId: communityMembers.communityId, community: communities.name, role: communityMembers.role, joinedAt: communityMembers.joinedAt })
      .from(communityMembers).innerJoin(communities, eq(communities.id, communityMembers.communityId)).where(eq(communityMembers.userId, userId)),
    db.select({ id: messages.id, conversationId: messages.conversationId, text: messages.text, attachments: messages.attachments, kind: messages.kind, createdAt: messages.createdAt, deletedAt: messages.deletedAt })
      .from(messages).where(eq(messages.senderId, userId)),
    db.select({ conversationId: conversationMembers.conversationId, name: conversations.name, isGroup: conversations.isGroup, role: conversationMembers.role, joinedAt: conversationMembers.joinedAt })
      .from(conversationMembers).innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId)).where(eq(conversationMembers.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
    db.select({ id: media.id, fileName: media.fileName, contentType: media.contentType, size: media.size, createdAt: media.createdAt, storageKey: media.storageKey, hasData: sql<boolean>`${media.data} is not null` }).from(media).where(eq(media.ownerId, userId)),
  ]);
  const otherIds = [...new Set(followRows.flatMap((f) => [f.followerId, f.followeeId]).filter((id) => id !== userId))];
  const people = otherIds.length ? await db.select({ id: users.id, name: users.name, handle: users.handle }).from(users).where(sql`${users.id} in ${otherIds}`) : [];
  const person = new Map(people.map((p) => [p.id, p]));
  const fileName = (m: { id: string; fileName: string | null; contentType: string }) => `medien/${m.id}${extensionOf(m)}`;
  return {
    json: {
      exportedAt: new Date().toISOString(),
      hinweis: "Alle Daten deines Grow|Obs-Kontos. Dateien liegen im Ordner medien/ (Name = Kennung der Datei).",
      konto: account,
      pushEinstellungen: prefs ?? null,
      sitzungen: sessionRows,
      anmeldeprotokoll: loginRows,
      folgt: followRows.filter((f) => f.followerId === userId).map((f) => ({ ...person.get(f.followeeId), status: f.status, seit: f.createdAt })),
      follower: followRows.filter((f) => f.followeeId === userId).map((f) => ({ ...person.get(f.followerId), status: f.status, seit: f.createdAt })),
      sortenSammlung: collectionRows,
      aufgaben: taskRows,
      grows: await Promise.all(myGrows.map(async (g) => ({
        ...g,
        logs: await db.select().from(growLogs).where(eq(growLogs.growId, g.id)),
        fotos: await db.select().from(growPhotos).where(eq(growPhotos.growId, g.id)),
        messwerte: await db.select().from(growEnv).where(eq(growEnv.growId, g.id)),
      }))),
      feedBeitraege: postRows,
      feedLikes: likeRows,
      feedLesezeichen: bookmarkRows,
      kommentare: commentRows,
      forumThreads: threadRows,
      forumAntworten: forumCommentRows,
      communities: memberRows,
      chats: chatMemberRows,
      chatNachrichten: messageRows,
      benachrichtigungen: notificationRows,
      dateien: mediaRows.map((m) => ({ id: m.id, name: m.fileName, typ: m.contentType, groesse: m.size, hochgeladenAm: m.createdAt, imZip: fileName(m) })),
    },
    media: mediaRows.map((m) => ({ ...m, zipName: fileName(m) })),
  };
}

function extensionOf(m: { fileName: string | null; contentType: string }): string {
  const clean = sanitizeFileName(m.fileName ?? "");
  const dot = clean.lastIndexOf(".");
  if (dot > 0 && clean.length - dot <= 8) return clean.slice(dot).toLowerCase();
  const map: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf" };
  return map[m.contentType] ?? "";
}

/** Bytes einer Datei: Bucket oder Datenbank. */
async function* mediaChunks(row: { id: string; storageKey: string | null }): AsyncGenerator<Uint8Array> {
  if (row.storageKey) {
    const reader = (await getObjectStream(row.storageKey)).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value?.length) yield value;
    }
  }
  const [data] = await db.select({ data: media.data }).from(media).where(eq(media.id, row.id));
  if (data?.data) yield new Uint8Array(data.data);
}

/**
 * ZIP als Stream: `daten.json` zuerst, dann je Datei ein Eintrag (unkomprimiert, die Bilder sind es ohnehin). Es wird immer
 * nur eine Datei im Speicher gehalten; eine nicht lesbare Datei bricht den Export nicht ab, sondern landet in `medien/_fehler.txt`.
 */
export async function exportZipStream(userId: string): Promise<ReadableStream<Uint8Array> | null> {
  const data = await collectExport(userId);
  if (!data) return null;
  const out: Uint8Array[] = [];
  let finished = false;
  let failure: unknown;
  const zip = new Zip((error, chunk, final) => {
    if (error) { failure = error; return; }
    out.push(chunk);
    if (final) finished = true;
  });
  const json = new ZipDeflate("daten.json", { level: 6 });
  zip.add(json);
  json.push(strToU8(JSON.stringify(data.json, null, 2)), true);
  const queue = [...data.media];
  const errors: string[] = [];
  let ended = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!out.length && !finished) {
          const next = queue.shift();
          if (next) {
            const file = new ZipPassThrough(next.zipName);
            zip.add(file);
            try {
              for await (const chunk of mediaChunks(next)) file.push(chunk, false);
            } catch (error) {
              errors.push(`${next.zipName}: ${(error as Error).name}`);
            }
            file.push(new Uint8Array(0), true);
          } else if (!ended) {
            ended = true;
            if (errors.length) {
              const note = new ZipDeflate("medien/_fehler.txt");
              zip.add(note);
              note.push(strToU8(`Diese Dateien konnten nicht gelesen werden:\n${errors.join("\n")}\n`), true);
            }
            zip.end();
          }
          if (failure) throw failure;
        }
        if (failure) throw failure;
        while (out.length) controller.enqueue(out.shift()!);
        if (finished) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
