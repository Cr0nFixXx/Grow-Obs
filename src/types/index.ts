/** Zentrale Typen: Domäne (domain.ts) + Eingaben/Session (hier). */
export type * from "./domain";

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  level: number;
  title: string;
  grows: number;
  harvests: number;
  followers: number;
  telegram: boolean;
  /** Wochenreport per Meldung (Opt-in, Server-Einstellung; B-71). */
  weeklyReport?: boolean;
  /** Profilfelder und Sichtbarkeit (B-73); im Demo-Modus teils leer. */
  /** Titelbild (`/media/<id>` oder HTTPS-URL), leer = Farbverlauf. */
  cover?: string;
  bio?: string;
  location?: string;
  growSince?: number | null;
  medium?: string | null;
  interests?: string[];
  profileVisibility?: "all" | "followers" | "nobody";
  /** Frühestens wieder möglich 30 Tage nach diesem Zeitpunkt. */
  handleChangedAt?: string | null;
  following?: number;
  /** Offene Follower-Anfragen an mich. */
  followRequests?: number;
  role: "member" | "moderator" | "admin" | "platform_admin";
  /** Gesetzt für Konten mit Einmalpasswort (B-58): bis zum Passwortwechsel ist die App gesperrt. */
  mustChangePassword?: boolean;
}

/** Eingaben für neue Entitäten (Subset der Pflichtfelder). */
export interface CreateGrowInput {
  name: string;
  strain: string;
  breeder: string;
  medium: string;
  type?: "Sativa" | "Indica" | "Hybrid";
  /** JJJJ-MM-TT; ohne Angabe: heute. */
  startDate?: string;
}

/** Änderbare Felder eines Grows (B-84). */
export interface UpdateGrowInput {
  name?: string;
  strain?: string;
  breeder?: string;
  type?: "Sativa" | "Indica" | "Hybrid";
  medium?: string;
  startDate?: string;
  totalDays?: number;
  expectedYield?: string;
  condition?: import("./domain").GrowCondition;
}

export interface FinishGrowInput {
  outcome: "harvested" | "aborted";
  date?: string;
  wetG?: number | null;
  dryG?: number | null;
  note?: string;
}

export interface CreateStrainInput {
  name: string;
  breeder: string;
  type: "Sativa" | "Indica" | "Hybrid";
  thc: number;
  cbd: number;
  flowering: number;
  yield: string;
  difficulty: 1 | 2 | 3;
  price: number;
  notes: string;
  effects: string[];
}

export interface CreateWikiInput {
  title: string;
  category: string;
  excerpt: string;
  body: string[];
  tags: string[];
}

export type TaskPriority = "hoch" | "mittel" | "niedrig";

export interface Task {
  id: string;
  title: string;
  grow: string;
  when: string;
  prio: TaskPriority;
  done: boolean;
}

export interface CreateTaskInput {
  title: string;
  grow: string;
  when: string;
  prio: TaskPriority;
}

export interface CreateThreadInput {
  title: string;
  sub: string;
  text: string;
}

/** Eintrag im Aktivitäts-Feed (Dashboard/Profil). */
export interface ActivityItem {
  id: string;
  who: string;
  avatar: string;
  action: string;
  target: string;
  time: string;
  icon: string;
  color: string;
}

export type CommunityRole = "member" | "moderator" | "admin";

export interface Community {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  members: number;
  role?: CommunityRole;
  joined: boolean;
  createdAt: string;
}

export interface CommunityMember {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  role: CommunityRole;
}

export interface CommunityDetail extends Community {
  membersList: CommunityMember[];
  /** Offene Meldungen – nur für Moderatoren/Admins. */
  openReports?: number;
}

/* ----- Moderation (B-61) ----- */
export type ReportKind = "post" | "comment";
export type ReportReason = "spam" | "harassment" | "illegal" | "offtopic" | "other";
export type ReportAction = "hide" | "dismiss";

export interface ReportInput {
  kind: ReportKind;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

export interface ReportEntry {
  id: string;
  reporter: string;
  reason: ReportReason;
  details: string;
  ago: string;
}

/** Warteschlange: alle Meldungen zu einem Inhalt. */
export interface ReportGroup {
  kind: ReportKind;
  targetId: string;
  status: "open" | "hidden" | "dismissed";
  count: number;
  /** `null` = Inhalt inzwischen gelöscht. */
  preview: { text: string; image: string | null; author: string; handle: string; hidden: boolean } | null;
  reports: ReportEntry[];
  resolvedBy?: string | null;
  resolvedAgo?: string | null;
}

export interface BannedMember {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bannedAt: string;
}

export interface CreateCommunityInput {
  name: string;
  description: string;
  isPrivate: boolean;
}
export interface CreatePostInput {
  /** Beitrag in einer Community (nur Mitglieder). */
  communityId?: string;
  text: string;
  image?: string;
  tags?: string[];
}
