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
  /** Erinnerung bei fehlenden Messwerten/Logs nach N Tagen (1–5); `null` = aus (B-88). */
  growReminderDays?: number | null;
  /** Profilfelder und Sichtbarkeit (B-73); im Demo-Modus teils leer. */
  /** Titelbild (`/media/<id>` oder HTTPS-URL), leer = Farbverlauf. */
  cover?: string;
  bio?: string;
  location?: string;
  growSince?: number | null;
  medium?: string | null;
  interests?: string[];
  profileVisibility?: "all" | "followers" | "nobody";
  /** Eigener Livestatus (B-97): Textstatus mit Einstellung und aktiver 24h-Status. */
  status?: { emoji: string; text: string; visibility: "all" | "followers" | "nobody" };
  live?: { text: string; image: string; expiresAt: string; visibility: "all" | "followers" | "nobody" } | null;
  /** Frühestens wieder möglich 30 Tage nach diesem Zeitpunkt. */
  handleChangedAt?: string | null;
  following?: number;
  /** Offene Follower-Anfragen an mich. */
  followRequests?: number;
  role: "member" | "moderator" | "admin" | "platform_admin";
  /** Gesetzt für Konten mit Einmalpasswort (B-58): bis zum Passwortwechsel ist die App gesperrt. */
  mustChangePassword?: boolean;
  /** Eigene Adresse (nur in der eigenen Sitzung, B-87). */
  email?: string;
  emailVerified?: boolean;
  /** true = Bestätigung steht aus und ist Pflicht (Mailversand konfiguriert): die App zeigt nur die Bestätigungsseite. */
  emailVerificationPending?: boolean;
}

/** Eingaben für neue Entitäten (Subset der Pflichtfelder). */
export interface CreateGrowInput {
  name: string;
  /** Eine Sorte (alter Weg); `strains` hat Vorrang. */
  strain?: string;
  breeder?: string;
  /** B-100: eine oder mehrere Sorten. */
  strains?: import("./domain").GrowStrain[];
  medium: string;
  type?: "Sativa" | "Indica" | "Hybrid";
  /** JJJJ-MM-TT; ohne Angabe: heute. */
  startDate?: string;
  /** B-102: Sichtbarkeit beim Anlegen; ohne Angabe privat. */
  visibility?: import("./domain").GrowVisibility;
}

/** Neuer Log-Eintrag (B-85); ohne `date` gilt heute, der Tag wird aus dem Datum berechnet. */
export interface AddLogInput {
  title: string;
  text: string;
  tag: import("./domain").GrowLog["tag"];
  /** JJJJ-MM-TT */
  date?: string;
  /** B-101: betroffene Sorten (IDs); leer = ganzer Grow. */
  strainIds?: string[];
}

export type UpdateLogInput = Partial<AddLogInput>;

/** Messwerte eines Tages (B-85): erneutes Speichern ersetzt den Tag; mindestens ein Wert. */
export interface EnvInput {
  /** JJJJ-MM-TT; ohne Angabe heute. */
  date?: string;
  temp?: number | null;
  rh?: number | null;
  ec?: number | null;
  ph?: number | null;
  /** B-101: pH/EC je Sorte; angegeben = ersetzt die Sortenwerte des Tages. */
  strainEnv?: { strainId: string; plant?: number; ph?: number | null; ec?: number | null }[];
}

/** Änderbare Felder eines Grows (B-84). */
export interface UpdateGrowInput {
  name?: string;
  strain?: string;
  /** B-100: ersetzt die ganze Sortenliste (Gewichte je Sorte werden unverändert zurückgegeben). */
  strains?: import("./domain").GrowStrain[];
  breeder?: string;
  type?: "Sativa" | "Indica" | "Hybrid";
  medium?: string;
  startDate?: string;
  totalDays?: number;
  expectedYield?: string;
  condition?: import("./domain").GrowCondition;
  visibility?: import("./domain").GrowVisibility;
  /** Blatt-Abzug fürs VPD, 0–6 °C (B-85). */
  leafOffset?: number;
  /** Zielbereiche (B-86/B-88); fehlender Schlüssel = unverändert, `null` = kein Ziel, `"default"` = Richtwert der Phase. */
  targets?: Partial<Record<import("./domain").TargetKey, import("./domain").TargetRange | null | "default">>;
}

export interface FinishGrowInput {
  outcome: "harvested" | "aborted";
  date?: string;
  wetG?: number | null;
  dryG?: number | null;
  /** B-100: Gewichte je Sorte in Reihenfolge der Sortenliste; die Summe ergibt die Gesamtgewichte. */
  strainWeights?: { wetG: number | null; dryG: number | null }[];
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
  /** Art der zugrunde liegenden Benachrichtigung (grow, task, forum, shop, ai, system) – bestimmt das Ziel beim Antippen. */
  type?: string;
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
/** `post`/`comment`: Feed (Community oder global). `thread`/`forum_comment`: Forum (nur global, B-89). */
export type ReportKind = "post" | "comment" | "thread" | "forum_comment";
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
  preview: { text: string; image: string | null; author: string; handle: string; hidden: boolean; title?: string } | null;
  reports: ReportEntry[];
  resolvedBy?: string | null;
  resolvedAgo?: string | null;
}

/** Eine Seite der Warteschlange (B-89): `hasMore` = es gibt weitere Gruppen. */
export interface ReportPage {
  items: ReportGroup[];
  hasMore: boolean;
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
