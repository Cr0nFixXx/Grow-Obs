import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
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
/** PostgreSQL bytea ↔ Node Buffer (Media-Speicher im Embedded-Betrieb). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const taskPriorityEnum = pgEnum("task_priority", ["hoch", "mittel", "niedrig"]);

/* ----------------------------- Identität ----------------------------- */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  avatarUrl: text("avatar_url"),
  /** Titelbild (B-76): `/media/<id>` oder HTTPS-URL. */
  coverUrl: text("cover_url"),
  level: integer("level").notNull().default(1),
  title: text("title").notNull().default("Grower"),
  telegram: boolean("telegram").notNull().default(false),
  /** Wochenreport per In-App-Meldung (+ Push, falls aktiv); Opt-in (B-71). */
  weeklyReport: boolean("weekly_report").notNull().default(false),
  /** ISO-Woche (Europe/Berlin) des letzten Reports, z. B. "2026-W43" – verhindert Doppelversand. */
  weeklyReportWeek: text("weekly_report_week"),
  /** Erinnerung bei fehlenden Messwerten/Logs nach N Tagen (1–5, B-88); `null` = aus. */
  growReminderDays: smallint("grow_reminder_days"),
  /** Profilfelder (B-73). */
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  growSince: smallint("grow_since"),
  medium: text("medium"),
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  /** Wer das Profil sehen darf: all | followers | nobody (CHECK in der Migration). */
  profileVisibility: text("profile_visibility").notNull().default("all"),
  /** Letzter Wechsel des Benutzernamens (höchstens 1x je 30 Tage). */
  handleChangedAt: timestamp("handle_changed_at", { withTimezone: true }),
  role: roleEnum("role").notNull().default("member"),
  /** Gesetzt für Betreiber-Konten mit Einmalpasswort (B-58): bis zum Passwortwechsel sind fast alle Endpunkte gesperrt. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /** Zeitpunkt der E-Mail-Bestätigung (B-87); Bestandskonten wurden bei der Migration als bestätigt markiert. */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /** Online-Status (B-59): gilt als online, solange `online_until` in der Zukunft liegt (Herzschlag verlängert um ~70 s). */
  onlineUntil: timestamp("online_until", { withTimezone: true }),
  /** Konto gelöscht (B-74): die Zeile bleibt nur als anonyme Hülle, wenn Inhalte anderer daran hängen; kein Login mehr möglich. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  banReason: text("ban_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Einmal-Links per E-Mail (B-87): Bestätigung, Passwort-Reset, Adresswechsel. Gespeichert wird nur der SHA-256-Hash des
 * Tokens; ein Link gilt einmal (`used_at`) und bis `expires_at`. `new_email` nur bei `change_email`.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["verify_email", "reset_password", "change_email"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    newEmail: text("new_email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash), index("auth_tokens_user_kind_idx").on(t.userId, t.kind)]
);

/** Folgen (B-73): `pending` = Anfrage an ein nicht öffentliches Profil, `accepted` = aktiv. Löschen = entfolgen/ablehnen. */
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "follows_pk", columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId, t.status)]
);

/** Serverseitige Sitzungen (B-54): Widerruf = Zeile löschen. Das Cookie-JWT trägt nur die Sitzungs-ID (`sid`). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]
);

/** Anmeldeprotokoll (B-55): nur Zeit, Ereignis und Gerätebezeichnung – bewusst ohne IP-Adresse; 90 Tage Aufbewahrung. */
export const loginEvents = pgTable(
  "login_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    event: text("event", { enum: ["login", "login_failed", "register", "password_changed", "role_changed", "password_reset", "email_verified", "email_changed"] }).notNull(),
    device: text("device").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_events_user_created_idx").on(t.userId, t.createdAt)]
);

/**
 * Gemeinsame Rate-Limit-Zähler (B-60). `key` ist ein SHA-256-Hash; Fenster und Ablauf zählen nach Datenbankzeit,
 * damit mehrere Instanzen übereinstimmen. In SQL als UNLOGGED angelegt (flüchtig, schnell – bei Absturz zurückgesetzt).
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)]
);

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
  /** Community-Beitrag (0001): null = kuratierter Katalog-Eintrag. */
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
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
  /** Autor-Konto (0001): null = redaktioneller Artikel. */
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});

/* ----------------------------- Feature-Flags (0004) ----------------------------- */
/** Globale Overrides zu den Datei-Defaults. Fehlende Zeile = Default (an). */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- App-Releases (0005) ----------------------------- */
/**
 * Release-Notes / Update-Ankündigungen. `severity`:
 *  optional = still (Badge), recommended = Banner, required = Pflicht-Update (blockierend).
 */
export const appReleases = pgTable("app_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  title: text("title").notNull(),
  notes: jsonb("notes").$type<string[]>().notNull().default([]),
  severity: text("severity").$type<"optional" | "recommended" | "required">().notNull().default("recommended"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Media (0002) ----------------------------- */
/** Bilder: Bytes in PostgreSQL (`data`, Embedded ohne S3) oder im Object Storage (`storageKey`, B-76). Max. 2 MB je Datei, Quote pro User in der Route. */
export type MessageAttachment = { path: string; kind: "image" | "file"; name: string; size: number; mime: string };

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data"),
  /** Schlüssel im Bucket (`media/<owner>/<id>`); gesetzt, wenn die Bytes im Object Storage liegen. */
  storageKey: text("storage_key"),
  /** Ursprünglicher Dateiname (Chat-Dateianhänge, B-81); bei Bildern leer. */
  fileName: text("file_name"),
  /** Chat-Anhang (B-82): gesetzt, sobald das Medium in einer Nachricht gesendet wurde – danach nur für Mitglieder dieser Unterhaltung (und den Absender) abrufbar. */
  conversationId: uuid("conversation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Sammlung (0002) ----------------------------- */
export const strainCollection = pgTable(
  "strain_collection",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    strainId: uuid("strain_id").notNull().references(() => strains.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("strain_collection_user_strain").on(t.userId, t.strainId)]
);

/* ----------------------------- Tasks (0001) ----------------------------- */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  grow: text("grow").notNull().default("Allgemein"),
  dueLabel: text("due_label").notNull().default("Heute"),
  prio: taskPriorityEnum("prio").notNull().default("mittel"),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  /** B-84: freier Sortenname (auch ohne Eintrag im Sortenkatalog). */
  strainName: text("strain_name").notNull().default(""),
  /** `active` | `harvested` | `aborted`. */
  status: text("status").notNull().default("active"),
  /** B-92: `private` (Standard) | `public` | `community` – wer den Grow auf dem Profil sieht. */
  visibility: text("visibility").notNull().default("private"),
  /** Selbst gesetzter Zustand: `gesund` | `beobachten` | `problem` (ersetzt den früheren Gesundheitsprozent). */
  condition: text("condition").notNull().default("gesund"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  endedOn: date("ended_on"),
  /** Phasenname → Datum (JJJJ-MM-TT), an dem die Phase begonnen wurde. */
  phaseDates: jsonb("phase_dates").$type<Record<string, string>>().notNull().default({}),
  wetWeightG: integer("wet_weight_g"),
  dryWeightG: integer("dry_weight_g"),
  harvestNote: text("harvest_note").notNull().default(""),
  /** B-85: Blatttemperatur = Lufttemperatur minus dieser Wert (für den VPD). */
  leafOffset: doublePrecision("leaf_offset").notNull().default(2),
  /**
   * B-88: Überschreibungen der Zielbereiche je Größe (ph, ec, temp, rh, vpd). Schlüssel fehlt = Standard der Phase (liegt im Frontend),
   * `null` = kein Ziel, `{min, max}` = eigener Bereich. (Die alten Spalten ph_min … ec_max aus B-86 bleiben ungenutzt in der Tabelle.)
   */
  targets: jsonb("targets").$type<Record<string, { min: number; max: number } | null>>().notNull().default({}),
  /** B-88: Datum (Europe/Berlin) der letzten Erinnerung – je Lücke ohne Eintrag wird nur einmal erinnert. */
  remindedEnvOn: date("reminded_env_on"),
  remindedLogOn: date("reminded_log_on"),
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
  /** B-85: echtes Datum des Eintrags (`day`/`date` oben sind Altlasten; der Tag wird aus diesem Datum berechnet). */
  loggedOn: date("logged_on").notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growPhotos = pgTable("grow_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  growId: uuid("grow_id").notNull().references(() => grows.id),
  url: text("url").notNull(),
  caption: text("caption").notNull().default(""),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growEnv = pgTable("grow_env", {
  id: uuid("id").primaryKey().defaultRandom(),
  growId: uuid("grow_id").notNull().references(() => grows.id),
  day: integer("day").notNull(),
  /** B-85: ein Eintrag je Grow und Tag; jeder Wert optional. `vpd` wird nicht mehr gespeichert (wird beim Lesen berechnet). */
  loggedOn: date("logged_on").notNull(),
  temp: doublePrecision("temp"),
  rh: doublePrecision("rh"),
  vpd: doublePrecision("vpd"),
  ec: doublePrecision("ec"),
  ph: doublePrecision("ph"),
}, (t) => [uniqueIndex("grow_env_grow_day_uq").on(t.growId, t.loggedOn)]);

/* ----------------------------- Social ----------------------------- */
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  imageUrl: text("image_url"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  /** Gesetzt = Beitrag gehört zu einer Community (nur für Mitglieder sichtbar, nicht im globalen Feed). */
  communityId: uuid("community_id").references(() => communities.id),
  /** Moderation (B-61): ausgeblendet = nur für Moderatoren/Admins der Community sichtbar. */
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("posts_community_created_idx").on(t.communityId, t.createdAt)]);

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

/** Sperrliste je Community (B-61): gesperrte Personen können nicht (erneut) beitreten – auch nicht per Code. */
export const communityBans = pgTable(
  "community_bans",
  {
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bannedBy: uuid("banned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("community_bans_uq").on(t.communityId, t.userId)]
);

/** Meldungen von Mitgliedern an die Moderation der Community (B-61). Eine Meldung je Person und Inhalt. */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"post" | "comment" | "thread" | "forum_comment">().notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").$type<"spam" | "harassment" | "illegal" | "offtopic" | "other">().notNull(),
    details: text("details").notNull().default(""),
    status: text("status").$type<"open" | "hidden" | "dismissed">().notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_once_uq").on(t.reporterId, t.kind, t.targetId),
    index("reports_queue_idx").on(t.communityId, t.status, t.createdAt),
  ]
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
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
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
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
});

/** Votes auf Forum-Kommentare (0003). */
export const commentVotes = pgTable(
  "comment_votes",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull().default(1),
  },
  (t) => [uniqueIndex("comment_votes_uq").on(t.commentId, t.userId)]
);

/** Kommentare zu Social-Posts und Hall-of-Fame-Einträgen (0003). `kind` + `itemId` = Ziel. */
export const itemComments = pgTable("item_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"post" | "hall">().notNull(),
  itemId: uuid("item_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Chat ----------------------------- */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  isGroup: boolean("is_group").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  /** Direktnachricht (B-59): sortierte Nutzer-IDs "a:b" → höchstens eine Konversation je Paar. */
  directKey: text("direct_key"),
  /** Gruppen (B-65): sehen später Beigetretene ältere Nachrichten? Aus = nur ab Beitritt (Standard). */
  historyVisible: boolean("history_visible").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("conversations_direct_key_uq").on(t.directKey).where(sql`${t.directKey} IS NOT NULL`)]);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** Leseposition (B-59): Nachrichten anderer nach diesem Zeitpunkt gelten als ungelesen. */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    /** Gruppen (B-65): `admin` verwaltet Mitglieder, Themen und Einstellungen; Direktnachrichten nutzen `member`. */
    role: memberRoleEnum("role").notNull().default("member"),
    /** Gruppen (B-65): Beitrittszeitpunkt – Ausgangspunkt für „Ungelesen“ und (ohne `history_visible`) für den sichtbaren Verlauf. */
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversation_members_uq").on(t.conversationId, t.userId), index("conversation_members_user_idx").on(t.userId)]
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Bild-Anhang (0002): /media/<id> */
  imageUrl: text("image_url"),
  /** Anhänge (B-81, 0018): Bilder und Dateien, je `{ path: "/media/<id>", kind, name, size, mime }`; `image_url` hält zusätzlich das erste Bild (Vorschau). */
  attachments: jsonb("attachments").$type<MessageAttachment[]>().notNull().default([]),
  /** Gruppen (B-65): Thema der Nachricht (Direktnachrichten: leer). */
  topicId: uuid("topic_id"),
  /** `user` = normale Nachricht, `system` = Hinweiszeile („Anna hat Bernd eingeladen“): zählt nicht als ungelesen, löst keinen Push aus. */
  kind: text("kind").notNull().default("user"),
  /** Gelöschte Nachricht (B-82): Text und Anhänge sind geleert, die Zeile bleibt als Platzhalter („Nachricht gelöscht“). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** B-94: zitierte Nachricht (Antwort); leer, wenn es keine Antwort ist oder das Original endgültig entfernt wurde. */
  replyTo: uuid("reply_to").references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
}, (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt), index("messages_topic_created_idx").on(t.topicId, t.createdAt)]);

/* ----------------------------- Gruppen: Themen, Einladungen (B-65) ----------------------------- */
/** Themen einer Gruppe (wie Telegram-Foren): jede Gruppe hat ein Standardthema „Allgemein“. Private Themen sehen nur ihre Mitglieder und die Gruppen-Admins. */
export const conversationTopics = pgTable("conversation_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  isPrivate: boolean("is_private").notNull().default(false),
  /** Nur Gruppen-Admins schreiben (Ankündigungen). */
  adminsOnly: boolean("admins_only").notNull().default(false),
  /** Geschlossen: nur Gruppen-Admins schreiben noch (Verlauf bleibt lesbar). */
  closed: boolean("closed").notNull().default(false),
  pinned: boolean("pinned").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("conversation_topics_conversation_idx").on(t.conversationId, t.position)]);

/** Mitglieder privater Themen. */
export const topicMembers = pgTable("topic_members", {
  topicId: uuid("topic_id").notNull().references(() => conversationTopics.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("topic_members_uq").on(t.topicId, t.userId)]);

/** Persönlicher Stand je Thema: Leseposition (fehlt = Beitritt) und Stummschaltung. */
export const topicUserState = pgTable("topic_user_state", {
  topicId: uuid("topic_id").notNull().references(() => conversationTopics.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  muted: boolean("muted").notNull().default(false),
}, (t) => [uniqueIndex("topic_user_state_uq").on(t.topicId, t.userId)]);

/** Einladungen in Gruppen: Beitritt nur nach Annahme; offene Einladungen laufen nach 7 Tagen ab. */
export const conversationInvites = pgTable("conversation_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  inviterId: uuid("inviter_id").references(() => users.id, { onDelete: "set null" }),
  inviteeId: uuid("invitee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** pending | accepted | declined | revoked */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("conversation_invites_pending_uq").on(t.conversationId, t.inviteeId).where(sql`${t.status} = 'pending'`),
  index("conversation_invites_invitee_idx").on(t.inviteeId, t.status),
]);

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

/** Web-Push-Abos (B-63): ein Eintrag je Browser/Gerät; hängt an der Sitzung und verschwindet mit ihr (Abmelden, „Alle Geräte“). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)]
);

/** Push-Einstellungen je Konto (B-63): Kategorien, Vorschau, Ruhezeit (Minuten seit Mitternacht, in der Zeitzone des Nutzers). */
export const pushPrefs = pgTable("push_prefs", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  messages: boolean("messages").notNull().default(true),
  community: boolean("community").notNull().default(true),
  grows: boolean("grows").notNull().default(true),
  other: boolean("other").notNull().default(true),
  showPreview: boolean("show_preview").notNull().default(false),
  quietEnabled: boolean("quiet_enabled").notNull().default(false),
  quietStart: integer("quiet_start").notNull().default(1320),
  quietEnd: integer("quiet_end").notNull().default(420),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  votes: many(commentVotes),
}));

export const commentVotesRelations = relations(commentVotes, ({ one }) => ({
  comment: one(comments, { fields: [commentVotes.commentId], references: [comments.id] }),
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

/** Protokoll der Moderationsaktionen (B-89). Namen als Momentaufnahme, bewusst ohne Fremdschlüssel. */
export const moderationLog = pgTable("moderation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  targetUserId: uuid("target_user_id"),
  targetName: text("target_name"),
  targetKind: text("target_kind"),
  targetId: uuid("target_id"),
  reason: text("reason"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
