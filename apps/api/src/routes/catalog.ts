import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  breeders,
  hallEntries,
  notifications,
  offers,
  products,
  strains,
  wikiArticles,
} from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { ago } from "../lib/time";

/* ----------------------------- Produkte & Angebote ----------------------------- */
export const products = new Hono<AuthEnv>();

products.get("/", async (c) => {
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return c.json(
    rows.map((p) => ({
      id: p.id, name: p.name, category: p.category, brand: p.brand, price: p.price,
      rating: p.rating, reviews: p.reviews, condition: p.condition, image: p.image,
    }))
  );
});

products.get("/categories", async (c) => {
  const rows = await db.select({ category: products.category }).from(products);
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

/* ----------------------------- Hall of Fame ----------------------------- */
export const hall = new Hono<AuthEnv>();
hall.get("/", async (c) => {
  const rows = await db.select().from(hallEntries);
  return c.json(
    rows.map((h) => ({
      id: h.id, title: h.title, grower: h.grower, avatar: h.avatarUrl ?? "", strain: h.strain,
      image: h.imageUrl, award: h.award, likes: h.likes, comments: h.comments, aspect: h.aspect,
    }))
  );
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
