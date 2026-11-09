import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { grows, notifications, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";

function call(path: string, { method = "GET", cookie, data }: { method?: string; cookie?: string; data?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(key: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD), ...extra }).returning({ id: users.id });
  const res = await call("/auth/login", { method: "POST", data: { email: `${key}@example.org`, password: PASSWORD } });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, handle: key, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const patch = (who: Who, data: unknown) => call("/auth/me", { method: "PATCH", cookie: who.cookie, data });
const profile = async (viewer: Who, handle: string) => ({ body: await (await call(`/members/${handle}`, { cookie: viewer.cookie })).json() as Record<string, any> });

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 2 }); });

describe("Profilfelder (PATCH /auth/me)", () => {
  it("speichert Bio, Ort, Anbau seit, Medium, Interessen und Sichtbarkeit und liefert sie zurück", async () => {
    const me = await makeUser("anna");
    const res = await patch(me, { bio: "  Living Soil seit Jahren  ", location: "Dortmund", growSince: 2019, medium: "Coco", interests: ["Indoor", "LED", "Indoor"], profileVisibility: "followers" });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body).toMatchObject({ bio: "Living Soil seit Jahren", location: "Dortmund", growSince: 2019, medium: "Coco", interests: ["Indoor", "LED"], profileVisibility: "followers", followers: 0, following: 0, followRequests: 0, handleChangedAt: null });
    const again = await (await call("/auth/me", { cookie: me.cookie })).json() as Record<string, any>;
    expect(again.bio).toBe("Living Soil seit Jahren");
  });

  it("lehnt ungültige Werte ab (400) und erlaubt Felder wieder zu leeren", async () => {
    const me = await makeUser("bob");
    for (const bad of [{ bio: "x".repeat(281) }, { location: "x".repeat(61) }, { growSince: 1980 }, { growSince: new Date().getFullYear() + 1 }, { medium: "Luft" }, { interests: ["Unbekannt"] }, { interests: ["Indoor", "Outdoor", "LED", "Coco", "Autoflower", "Gewächshaus"] }, { profileVisibility: "friends" }, { role: "admin" }]) {
      expect((await patch(me, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    await patch(me, { bio: "hallo", growSince: 2020, medium: "Erde" });
    const cleared = await (await patch(me, { bio: "", growSince: null, medium: null })).json() as Record<string, any>;
    expect(cleared).toMatchObject({ bio: "", growSince: null, medium: null });
  });
});

describe("Benutzername ändern", () => {
  it("ändert den @handle einmal je 30 Tage, prüft Muster und Eindeutigkeit", async () => {
    const me = await makeUser("carla");
    await makeUser("dieter");
    expect((await patch(me, { handle: "ab" })).status).toBe(400);
    expect((await patch(me, { handle: "mit leerzeichen" })).status).toBe(400);
    const taken = await patch(me, { handle: "Dieter" });
    expect(taken.status).toBe(409);
    const ok = await patch(me, { handle: "Carla_Neu" });
    expect(ok.status).toBe(200);
    const body = await ok.json() as Record<string, any>;
    expect(body.handle).toBe("carla_neu");
    expect(body.handleChangedAt).toBeTruthy();
    const second = await patch(me, { handle: "carla_zwei" });
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error: string }).error).toContain("30 Tage");
    // Gleicher Wert zählt nicht als Änderung.
    expect((await patch(me, { handle: "carla_neu", bio: "ok" })).status).toBe(200);
    // Nach Ablauf der Frist wieder möglich.
    await db.update(users).set({ handleChangedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(users.id, me.id));
    expect((await patch(me, { handle: "carla_zwei" })).status).toBe(200);
  });
});

describe("Mitgliedsprofil und Folgen", () => {
  it("öffentliches Profil: volle Daten, echte Statistik, Folgen sofort aktiv, Meldung, Entfolgen", async () => {
    const owner = await makeUser("eva");
    const fan = await makeUser("finn");
    await patch(owner, { bio: "Hallo", location: "Köln", medium: "Erde", interests: ["Outdoor"] });
    await db.insert(grows).values([{ userId: owner.id, name: "A", startDate: "2026-01-01", status: "harvested", visibility: "public" }, { userId: owner.id, name: "B", startDate: "2026-02-01", phase: "Blüte", visibility: "public" }, { userId: owner.id, name: "C", startDate: "2026-03-01" }]);
    const before = (await profile(fan, "eva")).body;
    expect(before).toMatchObject({ handle: "eva", isMe: false, restricted: false, bio: "Hallo", location: "Köln", interests: ["Outdoor"], relation: { following: "none", followedBy: false }, canFollow: true, stats: { grows: 2, harvests: 1, followers: 0, following: 0 } });
    expect(before).not.toHaveProperty("email");
    const follow = await call("/members/eva/follow", { method: "POST", cookie: fan.cookie });
    expect(await follow.json()).toEqual({ status: "accepted" });
    expect((await profile(fan, "eva")).body.stats.followers).toBe(1);
    expect((await profile(owner, "finn")).body.relation.followedBy).toBe(true);
    const me = await (await call("/auth/me", { cookie: owner.cookie })).json() as Record<string, any>;
    expect(me.followers).toBe(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(notes.map((n) => n.title)).toEqual(["Name finn folgt dir jetzt"]);
    // Zweites Folgen erzeugt keine zweite Meldung.
    await call("/members/eva/follow", { method: "POST", cookie: fan.cookie });
    expect((await db.select().from(notifications).where(eq(notifications.userId, owner.id))).length).toBe(1);
    const list = await (await call("/members/eva/followers", { cookie: fan.cookie })).json() as { handle: string }[];
    expect(list.map((p) => p.handle)).toEqual(["finn"]);
    const unfollow = await call("/members/eva/follow", { method: "DELETE", cookie: fan.cookie });
    expect(await unfollow.json()).toEqual({ status: "none" });
    expect((await profile(fan, "eva")).body.stats.followers).toBe(0);
  });

  it("Nur Follower: Fremde sehen nur Name/Bild/Titel, Anfrage → Bestätigung → volle Sicht; Ablehnen", async () => {
    const owner = await makeUser("gina");
    const a = await makeUser("hans");
    const b = await makeUser("ida");
    await patch(owner, { bio: "geheim", profileVisibility: "followers" });
    const restricted = (await profile(a, "gina")).body;
    expect(restricted).toMatchObject({ restricted: true, visibility: "followers", canFollow: true });
    for (const key of ["bio", "location", "stats", "interests", "memberSince"]) expect(restricted).not.toHaveProperty(key);
    expect((await call("/members/gina/followers", { cookie: a.cookie })).status).toBe(403);
    expect(await (await call("/members/gina/follow", { method: "POST", cookie: a.cookie })).json()).toEqual({ status: "pending" });
    await call("/members/gina/follow", { method: "POST", cookie: b.cookie });
    expect((await profile(a, "gina")).body).toMatchObject({ restricted: true, relation: { following: "pending" } });
    const requests = await (await call("/follows/requests", { cookie: owner.cookie })).json() as { id: string; handle: string }[];
    expect(requests.map((r) => r.handle).sort()).toEqual(["hans", "ida"]);
    expect(((await (await call("/auth/me", { cookie: owner.cookie })).json()) as Record<string, any>).followRequests).toBe(2);
    // Fremde dürfen nicht entscheiden.
    expect((await call(`/follows/requests/${a.id}/accept`, { method: "POST", cookie: b.cookie })).status).toBe(404);
    expect((await call(`/follows/requests/${a.id}/accept`, { method: "POST", cookie: owner.cookie })).status).toBe(200);
    expect((await call(`/follows/requests/${b.id}/decline`, { method: "POST", cookie: owner.cookie })).status).toBe(200);
    expect((await call(`/follows/requests/${b.id}/decline`, { method: "POST", cookie: owner.cookie })).status).toBe(404);
    expect((await profile(a, "gina")).body).toMatchObject({ restricted: false, bio: "geheim", relation: { following: "accepted" } });
    expect((await profile(b, "gina")).body).toMatchObject({ restricted: true, relation: { following: "none" } });
    const titles = (await db.select().from(notifications).where(eq(notifications.userId, a.id))).map((n) => n.title);
    expect(titles).toEqual(["Name gina hat deine Anfrage angenommen"]);
    // Follower entfernen.
    expect((await call(`/follows/followers/${a.id}`, { method: "DELETE", cookie: owner.cookie })).status).toBe(200);
    expect((await profile(a, "gina")).body.restricted).toBe(true);
  });

  it("Niemand: Folgen nicht möglich, Profil gesperrt, nur man selbst sieht alles", async () => {
    const owner = await makeUser("jan");
    const other = await makeUser("kim");
    await patch(owner, { bio: "privat", profileVisibility: "nobody" });
    expect((await profile(other, "jan")).body).toMatchObject({ restricted: true, canFollow: false, visibility: "nobody" });
    expect((await call("/members/jan/follow", { method: "POST", cookie: other.cookie })).status).toBe(403);
    expect((await profile(owner, "jan")).body).toMatchObject({ isMe: true, restricted: false, bio: "privat", visibility: "nobody" });
  });

  it("Sichtbarkeit wechseln: „alle“ nimmt offene Anfragen an, „niemand“ verwirft sie", async () => {
    const owner = await makeUser("lena");
    const a = await makeUser("max");
    const b = await makeUser("nora");
    await patch(owner, { profileVisibility: "followers" });
    await call("/members/lena/follow", { method: "POST", cookie: a.cookie });
    await patch(owner, { profileVisibility: "all" });
    expect((await profile(a, "lena")).body.relation.following).toBe("accepted");
    await patch(owner, { profileVisibility: "followers" });
    await call("/members/lena/follow", { method: "POST", cookie: b.cookie });
    await patch(owner, { profileVisibility: "nobody" });
    expect((await profile(b, "lena")).body.relation.following).toBe("none");
    expect((await profile(a, "lena")).body.relation.following).toBe("accepted"); // bestehende Follower bleiben
  });

  it("Fehlerfälle: sich selbst folgen 400, unbekanntes Mitglied 404, ohne Anmeldung 401", async () => {
    const me = await makeUser("otto");
    expect((await call("/members/otto/follow", { method: "POST", cookie: me.cookie })).status).toBe(400);
    expect((await call("/members/gibtsnicht", { cookie: me.cookie })).status).toBe(404);
    expect((await call("/members/gibtsnicht/follow", { method: "POST", cookie: me.cookie })).status).toBe(404);
    expect((await call("/members/otto")).status).toBe(401);
    expect((await call("/follows/requests")).status).toBe(401);
    expect((await call("/follows/requests/nicht-uuid/accept", { method: "POST", cookie: me.cookie })).status).toBe(404);
  });
});
