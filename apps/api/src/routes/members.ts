import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { follows, grows, users } from "../db/schema.ts";
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
  return db.query.users.findFirst({ where: eq(users.handle, handle.toLowerCase()) });
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
  const [[g], [h], [fr], [fg]] = await Promise.all([
    db.select({ n: count() }).from(grows).where(eq(grows.userId, u.id)),
    db.select({ n: count() }).from(grows).where(and(eq(grows.userId, u.id), eq(grows.phase, "Ernte"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followeeId, u.id), eq(follows.status, "accepted"))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followerId, u.id), eq(follows.status, "accepted"))),
  ]);
  return c.json({
    ...base,
    bio: u.bio,
    location: u.location,
    growSince: u.growSince ?? null,
    medium: u.medium ?? null,
    interests: u.interests,
    memberSince: u.createdAt.toISOString(),
    stats: { grows: g?.n ?? 0, harvests: h?.n ?? 0, followers: fr?.n ?? 0, following: fg?.n ?? 0 },
  });
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
