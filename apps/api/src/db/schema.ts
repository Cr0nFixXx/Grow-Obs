import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["member", "moderator", "admin", "platform_admin"]);
export const growTypeEnum = pgEnum("grow_type", ["Sativa", "Indica", "Hybrid"]);
export const conditionEnum = pgEnum("condition", ["Neu", "Wie neu", "Gebraucht"]);
export const notifTypeEnum = pgEnum("notif_type", ["grow", "task", "forum", "shop", "ai", "system"]);
export const memberRoleEnum = pgEnum("member_role", ["member", "moderator", "admin"]);

/* ----------------------------- Identität ----------------------------- */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  avatarUrl: text("avatar_url"),
  level: integer("level").notNull().default(1),
  title: text("title").notNull().default("Grower"),
  telegram: boolean("telegram").notNull().default(false),
  role: roleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Katalog ----------------------------- */
export const breeders = pgTable("breeders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  location: text("location").notNull(),
  founded: integer("founded").notNull(),
  rating: doublePrecision("rating").notNull().default(0),
  strainsCount: integer("strains_count").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  logoColor: text("logo_color").notNull().default("leaf"),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
});

export const strains = pgTable("strains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  breederName: text("breeder_name").notNull(),
  breederId: uuid("breeder_id").references(() => breeders.id),
  type: growTypeEnum("type").notNull().default("Hybrid"),
  thc: doublePrecision("thc").notNull().default(0),
  cbd: doublePrecision("cbd").notNull().default(0),
  flowering: integer("flowering").notNull().default(0),
  yieldRange: text("yield_range").notNull().default(""),
  difficulty: integer("difficulty").notNull().default(1),
  rating: doublePrecision("rating").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  price: integer("price").notNull().default(0),
  tag: text("tag").notNull().default(""),
  color: text("color").notNull().default("leaf"),
  notes: text("notes").notNull().default(""),
  effects: jsonb("effects").$type<string[]>().notNull().default([]),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  brand: text("brand").notNull(),
  price: integer("price").notNull().default(0),
  rating: doublePrecision("rating").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  condition: conditionEnum("condition").notNull().default("Neu"),
  image: text("image").notNull().default("leaf"),
});

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  strain: text("strain").notNull(),
  breeder: text("breeder").notNull(),
  shop: text("shop").notNull(),
  price: integer("price").notNull().default(0),
  oldPrice: integer("old_price"),
  type: growTypeEnum("type").notNull().default("Hybrid"),
  fem: boolean("fem").notNull().default(true),
});

export const hallEntries = pgTable("hall_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  grower: text("grower").notNull(),
  avatarUrl: text("avatar_url"),
  strain: text("strain").notNull(),
  imageUrl: text("image_url").notNull(),
  award: text("award").notNull().default(""),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  aspect: text("aspect").notNull().default("aspect-square"),
});

export const wikiArticles = pgTable("wiki_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: jsonb("body").$type<string[]>().notNull().default([]),
  author: text("author").notNull(),
  version: text("version").notNull().default("v1.0"),
  readMin: integer("read_min").notNull().default(3),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Grows ----------------------------- */
export const grows = pgTable("grows", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  strainId: uuid("strain_id").references(() => strains.id),
  breeder: text("breeder").notNull().default(""),
  type: growTypeEnum("type").notNull().default("Hybrid"),
  medium: text("medium").notNull().default(""),
  startDate: date("start_date").notNull(),
  day: integer("day").notNull().default(0),
  totalDays: integer("total_days").notNull().default(84),
  phase: text("phase").notNull().default("Keimung"),
  phaseIndex: integer("phase_index").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  health: integer("health").notNull().default(100),
  coverUrl: text("cover_url"),
  expectedYield: text("expected_yield").notNull().default("—"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growLogs = pgTable("grow_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  growId: uuid("grow_id").notNull().references(() => grows.id),
  day: integer("day").notNull().default(0),
  date: text("date").notNull().default("heute"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tag: text("tag").notNull().default("Beobachtung"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growPhotos = pgTable("grow_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  growId: uuid("grow_id").notNull().references(() => grows.id),
  url: text("url").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growEnv = pgTable("grow_env", {
  id: uuid("id").primaryKey().defaultRandom(),
  growId: uuid("grow_id").notNull().references(() => grows.id),
  day: integer("day").notNull(),
  temp: doublePrecision("temp").notNull().default(0),
  rh: doublePrecision("rh").notNull().default(0),
  vpd: doublePrecision("vpd").notNull().default(0),
  ec: doublePrecision("ec").notNull().default(0),
});

/* ----------------------------- Social ----------------------------- */
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  imageUrl: text("image_url"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("post_likes_uq").on(t.postId, t.userId)]
);

export const postBookmarks = pgTable(
  "post_bookmarks",
  {
    postId: uuid("post_id").notNull().references(() => posts.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("post_bookmarks_uq").on(t.postId, t.userId)]
);

/* ----------------------------- Communities ----------------------------- */
export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  isPrivate: boolean("is_private").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityMembers = pgTable(
  "community_members",
  {
    communityId: uuid("community_id").notNull().references(() => communities.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("community_members_uq").on(t.communityId, t.userId)]
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => communities.id),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Forum ----------------------------- */
export const subs = pgTable("subs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  subId: uuid("sub_id").notNull().references(() => subs.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tag: text("tag").notNull().default("Diskussion"),
  isTop: boolean("is_top").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const threadVotes = pgTable(
  "thread_votes",
  {
    threadId: uuid("thread_id").notNull().references(() => threads.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    delta: integer("delta").notNull().default(1),
  },
  (t) => [uniqueIndex("thread_votes_uq").on(t.threadId, t.userId)]
);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => threads.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  parentId: uuid("parent_id").references((): AnyPgColumn => comments.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Chat ----------------------------- */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  isGroup: boolean("is_group").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("conversation_members_uq").on(t.conversationId, t.userId)]
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Benachrichtigungen ----------------------------- */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: notifTypeEnum("type").notNull().default("system"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Relations ----------------------------- */
export const usersRelations = relations(users, ({ many }) => ({
  grows: many(grows),
}));

export const growsRelations = relations(grows, ({ one, many }) => ({
  user: one(users, { fields: [grows.userId], references: [users.id] }),
  strain: one(strains, { fields: [grows.strainId], references: [strains.id] }),
  logs: many(growLogs),
  photos: many(growPhotos),
  env: many(growEnv),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  sub: one(subs, { fields: [threads.subId], references: [subs.id] }),
  user: one(users, { fields: [threads.userId], references: [users.id] }),
  votes: many(threadVotes),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  thread: one(threads, { fields: [comments.threadId], references: [threads.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id], relationName: "commentReplies" }),
  replies: many(comments, { relationName: "commentReplies" }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  likes: many(postLikes),
  bookmarks: many(postBookmarks),
}));

// Relational queries need the inverse foreign-key mapping for every `many()`.
export const growLogsRelations = relations(growLogs, ({ one }) => ({
  grow: one(grows, { fields: [growLogs.growId], references: [grows.id] }),
}));
export const growPhotosRelations = relations(growPhotos, ({ one }) => ({
  grow: one(grows, { fields: [growPhotos.growId], references: [grows.id] }),
}));
export const growEnvRelations = relations(growEnv, ({ one }) => ({
  grow: one(grows, { fields: [growEnv.growId], references: [grows.id] }),
}));
export const threadVotesRelations = relations(threadVotes, ({ one }) => ({
  thread: one(threads, { fields: [threadVotes.threadId], references: [threads.id] }),
}));
export const postLikesRelations = relations(postLikes, ({ one }) => ({
  post: one(posts, { fields: [postLikes.postId], references: [posts.id] }),
}));
export const postBookmarksRelations = relations(postBookmarks, ({ one }) => ({
  post: one(posts, { fields: [postBookmarks.postId], references: [posts.id] }),
}));
