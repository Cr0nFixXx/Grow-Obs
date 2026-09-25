import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import { uuid } from "../lib/validation.ts";
import { z } from "zod";
import { db } from "../db/client.ts";
import {
  breeders,
  hallEntries,
  notifications,
  offers,
  products as productsTable,
  strainCollection,
  strains,
  users,
  wikiArticles,
} from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { ago } from "../lib/time.ts";
import { addItemComment, countItemComments, itemCommentSchema, listItemComments } from "../lib/item-comments.ts";

/* ----------------------------- Produkte & Angebote ----------------------------- */
export const products = new Hono<AuthEnv>();

products.get("/", async (c) => {
  const rows = await db.select().from(productsTable).orderBy(asc(productsTable.name)).limit(200);
  return c.json(
    rows.map((p) => ({
      id: p.id, name: p.name, category: p.category, brand: p.brand, price: p.price,
      rating: p.rating, reviews: p.reviews, condition: p.condition, image: p.image,
    }))
  );
});

products.get("/categories", async (c) => {
  const rows = await db.selectDistinct({ category: productsTable.category }).from(productsTable);
  const cats = Array.from(new Set(rows.map((r) => r.category)));
  return c.json(["Alles", ...cats]);
});

/* ----------------------------- Angebote (Ticker) ----------------------------- */
export const offersApi = new Hono<AuthEnv>();
offersApi.get("/", async (c) => {
  const rows = await db.select().from(offers);
  return c.json(
    rows.map((o) => ({
      id: o.id, strain: o.strain, breeder: o.breeder, shop: o.shop, price: o.price,
      oldPrice: o.oldPrice ?? undefined, type: o.type, fem: o.fem,
    }))
  );
});

/* ----------------------------- Breeder ----------------------------- */
export const breedersApi = new Hono<AuthEnv>();

function toBreeder(b: typeof breeders.$inferSelect) {
  return {
    id: b.id, name: b.name, location: b.location, founded: b.founded, rating: b.rating,
    strains: b.strainsCount, verified: b.verified, logoColor: b.logoColor, bio: b.bio, avatar: b.avatarUrl ?? "",
  };
}

breedersApi.get("/", async (c) => {
  const rows = await db.select().from(breeders).orderBy(asc(breeders.name));
  return c.json(rows.map(toBreeder));
});

breedersApi.get("/:id", async (c) => {
  const b = await db.query.breeders.findFirst({ where: eq(breeders.id, c.req.param("id")) });
  if (!b) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(toBreeder(b));
});

/* ----------------------------- Sorten ----------------------------- */
export const strainsApi = new Hono<AuthEnv>();

function toStrain(s: typeof strains.$inferSelect) {
  return {
    id: s.id, name: s.name, breeder: s.breederName, type: s.type, thc: s.thc, cbd: s.cbd,
    flowering: s.flowering, yield: s.yieldRange, difficulty: s.difficulty, rating: s.rating,
    reviews: s.reviews, price: s.price, tag: s.tag, color: s.color, notes: s.notes, effects: s.effects,
  };
}

strainsApi.get("/", async (c) => {
  const rows = await db.select().from(strains).orderBy(asc(strains.name));
  return c.json(rows.map(toStrain));
});

/** Persönliche Sammlung (angemeldet). */
strainsApi.get("/collection", requireAuth, async (c) => {
  const rows = await db.select({ s: strains }).from(strainCollection)
    .innerJoin(strains, eq(strainCollection.strainId, strains.id))
    .where(eq(strainCollection.userId, c.get("userId")))
    .orderBy(desc(strainCollection.createdAt));
  return c.json(rows.map((r) => toStrain(r.s)));
});

/** Sorte sammeln/entfernen (idempotentes Umschalten). */
strainsApi.post("/:id/collect", requireAuth, async (c) => {
  const strainId = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const exists = await db.query.strains.findFirst({ where: eq(strains.id, strainId) });
  if (!exists) return c.json({ error: "Nicht gefunden" }, 404);
  const removed = await db.delete(strainCollection)
    .where(and(eq(strainCollection.userId, userId), eq(strainCollection.strainId, strainId))).returning();
  if (removed.length) return c.json({ collected: false });
  await db.insert(strainCollection).values({ userId, strainId }).onConflictDoNothing();
  return c.json({ collected: true });
});

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const createStrainSchema = z.object({
  name: text(1, 80),
  breeder: text(1, 80),
  type: z.enum(["Sativa", "Indica", "Hybrid"]),
  thc: z.number().min(0).max(40),
  cbd: z.number().min(0).max(30),
  flowering: z.number().int().min(4).max(20),
  yield: z.string().trim().max(60).default(""),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  price: z.number().min(0).max(10000),
  notes: z.string().trim().max(2000).default(""),
  effects: z.array(text(1, 30)).max(6).default([]),
}).strict();
const typeColor = { Sativa: "info", Indica: "soil", Hybrid: "leaf" } as const;

/** Community-Sorte anlegen (angemeldet). Bewertung startet bei 0; Breeder wird per Name verknüpft. */
strainsApi.post("/", requireAuth, async (c) => {
  const body = createStrainSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const d = body.data;
  const breeder = await db.query.breeders.findFirst({ where: eq(breeders.name, d.breeder) });
  const [row] = await db.insert(strains).values({
    name: d.name, breederName: d.breeder, breederId: breeder?.id ?? null, type: d.type, thc: d.thc, cbd: d.cbd,
    flowering: d.flowering, yieldRange: d.yield, difficulty: d.difficulty, price: Math.round(d.price),
    notes: d.notes, effects: d.effects, tag: "Community", color: typeColor[d.type], createdBy: c.get("userId"),
  }).returning();
  await db.insert(strainCollection).values({ userId: c.get("userId"), strainId: row.id }).onConflictDoNothing();
  return c.json(toStrain(row), 201);
});

/* ----------------------------- Hall of Fame ----------------------------- */
export const hall = new Hono<AuthEnv>();
hall.get("/", async (c) => {
  const rows = await db.select().from(hallEntries);
  const counts = await countItemComments("hall", rows.map((h) => h.id));
  return c.json(
    rows.map((h) => ({
      id: h.id, title: h.title, grower: h.grower, avatar: h.avatarUrl ?? "", strain: h.strain,
      image: h.imageUrl, award: h.award, likes: h.likes, comments: counts.get(h.id) ?? 0, aspect: h.aspect,
    }))
  );
});

hall.get("/:id/comments", async (c) => {
  const id = uuid(c.req.param("id"));
  if (!await db.query.hallEntries.findFirst({ where: eq(hallEntries.id, id) })) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(await listItemComments("hall", id));
});

hall.post("/:id/comments", requireAuth, async (c) => {
  const id = uuid(c.req.param("id"));
  const body = itemCommentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  if (!await db.query.hallEntries.findFirst({ where: eq(hallEntries.id, id) })) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(await addItemComment("hall", id, c.get("userId"), body.data.text), 201);
});

/* ----------------------------- Wiki ----------------------------- */
export const wiki = new Hono<AuthEnv>();

wiki.get("/categories", async (c) => {
  const rows = await db.select({ category: wikiArticles.category }).from(wikiArticles);
  const cats = Array.from(new Set(rows.map((r) => r.category)));
  return c.json(["Übersicht", ...cats]);
});

wiki.get("/", async (c) => {
  const rows = await db.select().from(wikiArticles).orderBy(asc(wikiArticles.title));
  return c.json(
    rows.map((a) => ({
      id: a.id, title: a.title, category: a.category, excerpt: a.excerpt, readMin: a.readMin,
      author: a.author, updated: ago(a.updatedAt), version: a.version, body: a.body, tags: a.tags,
    }))
  );
});

const createWikiSchema = z.object({
  title: text(4, 120),
  category: text(1, 60),
  excerpt: z.string().trim().max(280).default(""),
  body: z.array(text(1, 5000)).min(1).max(50),
  tags: z.array(text(1, 30)).max(6).default([]),
}).strict();

/** Community-Artikel veröffentlichen (angemeldet) – startet als Entwurf v0.1, Autor = Kontoname. */
wiki.post("/", requireAuth, async (c) => {
  const body = createWikiSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const d = body.data;
  if (d.body.join(" ").length < 40) return c.json({ error: "Inhalt zu kurz" }, 400);
  const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, c.get("userId"))).limit(1);
  const words = d.body.join(" ").split(/\s+/).filter(Boolean).length;
  const [a] = await db.insert(wikiArticles).values({
    title: d.title, category: d.category, excerpt: d.excerpt || d.body[0].slice(0, 140), body: d.body, tags: d.tags,
    author: author?.name ?? "Community", version: "0.1", readMin: Math.max(1, Math.round(words / 200)), createdBy: c.get("userId"),
  }).returning();
  return c.json({
    id: a.id, title: a.title, category: a.category, excerpt: a.excerpt, readMin: a.readMin,
    author: a.author, updated: ago(a.updatedAt), version: a.version, tags: a.tags,
  }, 201);
});

wiki.get("/:id", async (c) => {
  const a = await db.query.wikiArticles.findFirst({ where: eq(wikiArticles.id, c.req.param("id")) });
  if (!a) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json({
    id: a.id, title: a.title, category: a.category, excerpt: a.excerpt, readMin: a.readMin,
    author: a.author, updated: ago(a.updatedAt), version: a.version, body: a.body, tags: a.tags,
  });
});

/* ----------------------------- Aktivität (abgeleitet) ----------------------------- */
const iconMap: Record<string, string> = {
  grow: "Sprout", task: "ListChecks", forum: "MessagesSquare", shop: "ShoppingBag", ai: "Sparkles", system: "Info",
};
const colorMap: Record<string, string> = {
  grow: "leaf", task: "warning", forum: "info", shop: "warning", ai: "leaf", system: "info",
};

export const activity = new Hono<AuthEnv>();
activity.get("/", requireAuth, async (c) => {
  // Fundament: aus Benachrichtigungen abgeleitet (später zentrale Event-Quelle).
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, c.get("userId")))
    .orderBy(desc(notifications.createdAt))
    .limit(10);
  return c.json(
    rows.map((n) => ({
      id: `a-${n.id}`,
      who: "Du",
      avatar: "",
      action: "hat erhalten:",
      target: n.title,
      time: ago(n.createdAt),
      icon: iconMap[n.type] ?? "Info",
      color: colorMap[n.type] ?? "info",
    }))
  );
});
