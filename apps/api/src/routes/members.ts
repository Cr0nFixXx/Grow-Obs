import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { comments, communityMembers, follows, grows, subs, threads, users, wikiArticles } from "../db/schema.ts";
import { toGrow } from "./grows.ts";
import { growState } from "../lib/grow-state.ts";
import { ago } from "../lib/time.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { createNotification } from "../lib/notify.ts";

/**
 * Mitgliedsprofile und Folgen (B-73).
 * Sichtbarkeit: `all` = jedes angemeldete Mitglied, `followers` = nur bestätigte Follower, `nobody` = nur man selbst.
 * Name, @handle, Profilbild und Titel sind immer sichtbar (Chat, Forum). Folgen: bei `all` sofort aktiv, bei `followers` als Anfrage
 * mit Bestätigung, bei `nobody` nicht möglich.
 */
export const membersApi = new Hono<AuthEnv>();
membersApi.use("*", requireAuth);

export const followsApi = new Hono<AuthEnv>();
followsApi.use("*", requireAuth);

type Relation = "none" | "pending" | "accepted";
const person = { id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl, title: users.title };
const toPerson = (r: { id: string; name: string; handle: string; avatar: string | null; title: string }) => ({ id: r.id, name: r.name, handle: r.handle, avatar: r.avatar ?? "", title: r.title });

async function findByHandle(handle: string) {
  return db.query.users.findFirst({ where: and(eq(users.handle, handle.toLowerCase()), isNull(users.deletedAt)) });
}
async function relationOf(followerId: string, followeeId: string): Promise<Relation> {
  const row = await db.query.follows.findFirst({ where: and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)), columns: { status: true } });
  return (row?.status as Relation | undefined) ?? "none";
}
/** Darf `viewer` das ganze Profil von `target` sehen? */
export async function canViewProfile(viewerId: string, target: { id: string; profileVisibility: string }): Promise<boolean> {
  if (target.id === viewerId || target.profileVisibility === "all") return true;
  if (target.profileVisibility === "followers") return (await relationOf(viewerId, target.id)) === "accepted";
  return false;
}

/** Teilen `a` und `b` mindestens eine Community? */
async function sharesCommunity(a: string, b: string): Promise<boolean> {
  const mine = await db.select({ id: communityMembers.communityId }).from(communityMembers).where(eq(communityMembers.userId, a));
  if (mine.length === 0) return false;
  const [hit] = await db.select({ id: communityMembers.communityId }).from(communityMembers)
    .where(and(eq(communityMembers.userId, b), inArray(communityMembers.communityId, mine.map((m) => m.id)))).limit(1);
  return !!hit;
}

/**
 * Grows von `owner`, die `viewer` sehen darf (B-92): der Besitzer sieht alle; sonst nur, wenn das Profil sichtbar ist und der Grow
 * `public` ist – oder `community` und beide Mitglied derselben Community sind. Private Grows tauchen nie auf (auch nicht in Zahlen).
 */
async function visibleGrows(viewerId: string, owner: { id: string; profileVisibility: string }) {
  if (owner.id === viewerId) return db.select().from(grows).where(eq(grows.userId, owner.id)).orderBy(desc(grows.createdAt));
  if (!(await canViewProfile(viewerId, owner))) return [];
  const levels = (await sharesCommunity(viewerId, owner.id)) ? ["public", "community"] : ["public"];
  return db.select().from(grows).where(and(eq(grows.userId, owner.id), inArray(grows.visibility, levels))).orderBy(desc(grows.createdAt));
}

membersApi.get("/:handle", async (c) => {
  const viewerId = c.get("userId");
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  const isMe = u.id === viewerId;
  const [following, followedBy] = isMe ? (["none", "none"] as Relation[]) : await Promise.all([relationOf(viewerId, u.id), relationOf(u.id, viewerId)]);
  const full = await canViewProfile(viewerId, u);
  const base = {
    ...toPerson({ id: u.id, name: u.name, handle: u.handle, avatar: u.avatarUrl, title: u.title }),
    isMe,
    restricted: !full,
    // Hinweis, warum das Profil nicht offen ist (nur Beschriftung, kein Datenleck).
    visibility: isMe || !full ? u.profileVisibility : undefined,
    relation: { following, followedBy: followedBy === "accepted" },
    canFollow: !isMe && (following !== "none" || u.profileVisibility !== "nobody"),
  };
  if (!full) return c.json(base);
  const shown = await visibleGrows(viewerId, u);
  const [[fr], [fg]] = await Promise.all([
    db.select({ n: count() }).from(follows).where(and(eq(follows.followeeId, u.id), eq(follows.status, "accepted"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followerId, u.id), eq(follows.status, "accepted"))),
  ]);
  return c.json({
    ...base,
    cover: u.coverUrl ?? "",
    bio: u.bio,
    location: u.location,
    growSince: u.growSince ?? null,
    medium: u.medium ?? null,
    interests: u.interests,
    memberSince: u.createdAt.toISOString(),
    stats: { grows: shown.length, harvests: shown.filter((x) => x.status === "harvested").length, followers: fr?.n ?? 0, following: fg?.n ?? 0 },
  });
});

/** Grows eines Mitglieds, soweit für den Betrachter sichtbar (B-92). */
membersApi.get("/:handle/grows", async (c) => {
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  const rows = await visibleGrows(c.get("userId"), u);
  return c.json(rows.map((r) => {
    const state = growState(r);
    return {
      id: r.id, name: r.name, strain: r.strainName || "Unbekannt", type: r.type, medium: r.medium, startDate: r.startDate,
      day: state.day, totalDays: r.totalDays, phase: state.phase, progress: state.progress, status: r.status, condition: r.condition,
      cover: r.coverUrl ?? "", visibility: r.visibility, archived: r.archivedAt !== null,
    };
  }));
});

/** Ein sichtbarer Grow eines Mitglieds, nur lesen (Tagebuch, Fotos, Messwerte). Unsichtbar = 404, damit nichts verraten wird. */
membersApi.get("/:handle/grows/:id", async (c) => {
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Nicht gefunden" }, 404);
  const row = (await visibleGrows(c.get("userId"), u)).find((r) => r.id === id);
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(await toGrow(row));
});

/** Öffentliche Aktivität (Forum-Threads, Forum-Kommentare, Wiki-Artikel); ausgeblendete Inhalte fehlen. */
membersApi.get("/:handle/activity", async (c) => {
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  if (!(await canViewProfile(c.get("userId"), u))) return c.json({ error: "Dieses Profil ist nicht sichtbar." }, 403);
  const [t, k, w] = await Promise.all([
    db.select({ id: threads.id, title: threads.title, sub: subs.name, at: threads.createdAt }).from(threads).innerJoin(subs, eq(subs.id, threads.subId))
      .where(and(eq(threads.userId, u.id), isNull(threads.hiddenAt))).orderBy(desc(threads.createdAt)).limit(20),
    db.select({ id: comments.id, threadId: threads.id, title: threads.title, sub: subs.name, at: comments.createdAt }).from(comments)
      .innerJoin(threads, eq(threads.id, comments.threadId)).innerJoin(subs, eq(subs.id, threads.subId))
      .where(and(eq(comments.userId, u.id), isNull(comments.hiddenAt), isNull(threads.hiddenAt))).orderBy(desc(comments.createdAt)).limit(20),
    db.select({ id: wikiArticles.id, title: wikiArticles.title, at: wikiArticles.updatedAt }).from(wikiArticles)
      .where(eq(wikiArticles.createdBy, u.id)).orderBy(desc(wikiArticles.updatedAt)).limit(20),
  ]);
  const items = [
    ...t.map((r) => ({ id: `t-${r.id}`, kind: "thread" as const, title: r.title, sub: r.sub, targetId: r.id, at: r.at })),
    ...k.map((r) => ({ id: `c-${r.id}`, kind: "comment" as const, title: r.title, sub: r.sub, targetId: r.threadId, at: r.at })),
    ...w.map((r) => ({ id: `w-${r.id}`, kind: "wiki" as const, title: r.title, sub: "", targetId: r.id, at: r.at })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);
  return c.json(items.map((i) => ({ ...i, at: i.at.toISOString(), ago: ago(i.at) })));
});

async function list(c: Context<AuthEnv>, direction: "followers" | "following") {
  const u = await findByHandle(c.req.param("handle")!);
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  if (!(await canViewProfile(c.get("userId"), u))) return c.json({ error: "Dieses Profil ist nicht sichtbar." }, 403);
  const mine = direction === "followers" ? eq(follows.followeeId, u.id) : eq(follows.followerId, u.id);
  const other = direction === "followers" ? follows.followerId : follows.followeeId;
  const rows = await db.select(person).from(follows).innerJoin(users, eq(users.id, other)).where(and(mine, eq(follows.status, "accepted"))).orderBy(desc(follows.createdAt)).limit(200);
  return c.json(rows.map(toPerson));
}
membersApi.get("/:handle/followers", (c) => list(c, "followers"));
membersApi.get("/:handle/following", (c) => list(c, "following"));

const followLimit = rateLimit({ name: "follow", limit: 60, windowMs: 10 * 60 * 1000, keys: userKey });

membersApi.post("/:handle/follow", followLimit, async (c) => {
  const me = c.get("userId");
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  if (u.id === me) return c.json({ error: "Du kannst dir nicht selbst folgen." }, 400);
  const existing = await relationOf(me, u.id);
  if (existing !== "none") return c.json({ status: existing });
  if (u.profileVisibility === "nobody") return c.json({ error: "Dieses Profil ist privat." }, 403);
  const status: Relation = u.profileVisibility === "all" ? "accepted" : "pending";
  const inserted = await db.insert(follows).values({ followerId: me, followeeId: u.id, status }).onConflictDoNothing().returning({ status: follows.status });
  if (inserted.length > 0) {
    const [self] = await db.select({ name: users.name, handle: users.handle }).from(users).where(eq(users.id, me));
    await createNotification(u.id, status === "accepted"
      ? { type: "system", title: `${self?.name ?? "Jemand"} folgt dir jetzt`, url: `/u/${self?.handle ?? ""}` }
      : { type: "system", title: `${self?.name ?? "Jemand"} möchte dir folgen`, body: "Öffne dein Profil, um die Anfrage anzunehmen oder abzulehnen.", url: "/profile" });
  }
  return c.json({ status });
});

/** Entfolgen oder eigene Anfrage zurückziehen (idempotent). */
membersApi.delete("/:handle/follow", async (c) => {
  const u = await findByHandle(c.req.param("handle"));
  if (!u) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  await db.delete(follows).where(and(eq(follows.followerId, c.get("userId")), eq(follows.followeeId, u.id)));
  return c.json({ status: "none" });
});

/** Offene Anfragen an mich. */
followsApi.get("/requests", async (c) => {
  const rows = await db.select({ ...person, at: follows.createdAt }).from(follows).innerJoin(users, eq(users.id, follows.followerId))
    .where(and(eq(follows.followeeId, c.get("userId")), eq(follows.status, "pending"))).orderBy(asc(follows.createdAt)).limit(100);
  return c.json(rows.map((r) => ({ ...toPerson(r), requestedAt: r.at.toISOString() })));
});

followsApi.post("/requests/:userId/accept", async (c) => {
  const me = c.get("userId");
  const id = c.req.param("userId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Anfrage nicht gefunden" }, 404);
  const updated = await db.update(follows).set({ status: "accepted" }).where(and(eq(follows.followerId, id), eq(follows.followeeId, me), eq(follows.status, "pending"))).returning({ id: follows.followerId });
  if (updated.length === 0) return c.json({ error: "Anfrage nicht gefunden" }, 404);
  const [self] = await db.select({ name: users.name, handle: users.handle }).from(users).where(eq(users.id, me));
  await createNotification(id, { type: "system", title: `${self?.name ?? "Jemand"} hat deine Anfrage angenommen`, url: `/u/${self?.handle ?? ""}` });
  return c.json({ ok: true });
});

followsApi.post("/requests/:userId/decline", async (c) => {
  const id = c.req.param("userId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Anfrage nicht gefunden" }, 404);
  const removed = await db.delete(follows).where(and(eq(follows.followerId, id), eq(follows.followeeId, c.get("userId")), eq(follows.status, "pending"))).returning({ id: follows.followerId });
  if (removed.length === 0) return c.json({ error: "Anfrage nicht gefunden" }, 404);
  return c.json({ ok: true });
});

/** Einen Follower entfernen (ohne Benachrichtigung). */
followsApi.delete("/followers/:userId", async (c) => {
  const id = c.req.param("userId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Follower nicht gefunden" }, 404);
  await db.delete(follows).where(and(eq(follows.followerId, id), eq(follows.followeeId, c.get("userId")), eq(follows.status, "accepted")));
  return c.json({ ok: true });
});
