/**
 * Domänen-Typen (Single Source of Truth, B-45).
 * Früher in src/mocks/data.ts definiert; Mocks, Services und UI importieren jetzt von hier
 * (bevorzugt über "@/types").
 */

export type Type = "Sativa" | "Indica" | "Hybrid";

export interface Strain {
  id: string;
  name: string;
  breeder: string;
  type: Type;
  thc: number;
  cbd: number;
  flowering: number; // weeks
  yield: string;
  difficulty: 1 | 2 | 3;
  rating: number;
  reviews: number;
  price: number;
  tag: string;
  color: string;
  notes: string;
  effects: string[];
}

export interface Breeder {
  id: string;
  name: string;
  location: string;
  founded: number;
  rating: number;
  strains: number;
  verified: boolean;
  logoColor: string;
  bio: string;
  avatar: string;
}

export interface SeedOffer {
  id: string;
  strain: string;
  breeder: string;
  shop: string;
  price: number;
  oldPrice?: number;
  type: Type;
  fem: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  rating: number;
  reviews: number;
  condition: "Neu" | "Wie neu" | "Gebraucht";
  image: string;
}

export interface WikiArticle {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  readMin: number;
  author: string;
  updated: string;
  version: string;
  body: string[];
  tags: string[];
}

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  body: string;
  votes: number;
  ago: string;
  replies?: Comment[];
}

export interface ForumThread {
  id: string;
  title: string;
  sub: string;
  author: string;
  avatar: string;
  votes: number;
  comments: number;
  ago: string;
  excerpt: string;
  tag: string;
  top?: boolean;
}

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
  last: string;
  time: string;
  unread: number;
  messages: ChatMessage[];
}

export interface GrowPhase {
  key: string;
  label: string;
  done: boolean;
  /** Aktuelle Phase eines laufenden Grows. */
  active?: boolean;
  /** Datum (JJJJ-MM-TT), an dem die Phase begonnen wurde; `null` = noch nicht begonnen. */
  startedOn?: string | null;
  /** Tag des Grows beim Phasenstart. */
  startDay?: number | null;
}

/** Lebenszyklus (B-84): läuft, geerntet oder abgebrochen. */
export type GrowStatus = "active" | "harvested" | "aborted";
/** Selbst gesetzter Zustand (ersetzt den früheren Gesundheitsprozent). */
export type GrowCondition = "gesund" | "beobachten" | "problem";
/** Wer einen Grow auf dem Profil sieht (B-92): nur ich (Standard), jedes Mitglied oder nur gemeinsame Communities. */
export type GrowVisibility = "private" | "public" | "community";
/** Eine Sorte eines Grows (B-100). Gewichte nur nach der Ernte. */
export interface GrowStrain {
  /** Stabile ID (B-101); neue Zeilen im Editor haben noch keine. */
  id?: string;
  name: string; breeder: string; plants: number | null; wetG: number | null; dryG: number | null;
}
/** Kurzform eines Grows in der Liste auf einem fremden Profil. */
export interface MemberGrowBrief {
  id: string; name: string; strain: string; strains?: string[]; type: string; medium: string; startDate: string; day: number; totalDays: number;
  phase: string; progress: number; status: GrowStatus; condition: GrowCondition; cover: string; visibility: GrowVisibility; archived: boolean;
}
/** Öffentliche Aktivität eines Mitglieds: Forum-Thread, Forum-Kommentar oder Wiki-Artikel. */
export interface MemberActivityItem {
  id: string; kind: "thread" | "comment" | "wiki"; title: string; sub: string; targetId: string; at: string; ago: string;
}

export interface GrowHarvest {
  wetG: number | null;
  dryG: number | null;
  note: string;
}

/** Messwerte eines Tages (B-85); jeder Wert ist optional, das VPD wird aus Temperatur und Luftfeuchte berechnet. */
export interface EnvPoint {
  day: number;
  /** JJJJ-MM-TT */
  date: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  ec: number | null;
  ph: number | null;
}

/** pH/EC einer Sorte an einem Tag (B-101); Temperatur und Luftfeuchte gelten für den ganzen Grow (`EnvPoint`). */
export interface StrainEnvPoint {
  day: number;
  date: string;
  strainId: string;
  ph: number | null;
  ec: number | null;
}

export interface TargetRange { min: number; max: number }

/** Größen mit Zielbereich (B-88). */
export type TargetKey = "ph" | "ec" | "temp" | "rh" | "vpd";
/**
 * Überschreibungen der Zielbereiche eines Grows. Fehlender Schlüssel = Richtwert der jeweiligen Phase (`PHASE_TARGETS`),
 * `null` = kein Ziel (Band ausgeblendet), `{min, max}` = eigener Bereich für alle Phasen.
 */
export type GrowTargets = Partial<Record<TargetKey, TargetRange | null>>;
/** Wirksame Zielbereiche zu einem Zeitpunkt (Phase + Überschreibung). */
export type EffectiveTargets = Record<TargetKey, TargetRange | null>;

export interface GrowPhoto {
  id: string;
  url: string;
  caption: string;
  /** Aktuelles Titelbild des Grows. */
  cover: boolean;
  /** Aufnahmedatum (JJJJ-MM-TT, Europe/Berlin) und Tag des Grows (B-88). */
  date?: string;
  day?: number;
  /** B-101: zugeordnete Sorten (IDs); leer oder fehlend = ganzer Grow. */
  strainIds?: string[];
}

export interface GrowLog {
  id: string;
  day: number;
  date: string;
  title: string;
  text: string;
  tag: "Gießen" | "Dünger" | "Training" | "Beobachtung" | "Schädling" | "Ernte";
  /** B-101: betroffene Sorten (IDs); leer oder fehlend = ganzer Grow. */
  strainIds?: string[];
}

export interface Grow {
  id: string;
  name: string;
  /** Alle Sortennamen, kommagetrennt (Anzeigetext); die Liste steht in `strains`. */
  strain: string;
  /** B-100: alle Sorten des Grows. */
  strains: GrowStrain[];
  breeder: string;
  type: Type;
  medium: string;
  startDate: string;
  day: number;
  totalDays: number;
  phase: string;
  phaseIndex: number;
  progress: number;
  status: GrowStatus;
  condition: GrowCondition;
  visibility: GrowVisibility;
  archived: boolean;
  /** Ende (Ernte/Abbruch), JJJJ-MM-TT. */
  endedOn: string | null;
  harvest: GrowHarvest | null;
  cover: string;
  photos: GrowPhoto[];
  /** Abzug von der Lufttemperatur für die Blatttemperatur (°C) beim VPD, Standard 2. */
  leafOffset: number;
  /** Überschreibungen der Zielbereiche (B-86/B-88); der Rest folgt den Richtwerten der Phase. */
  targets: GrowTargets;
  phases: GrowPhase[];
  env: EnvPoint[];
  /** B-101: pH/EC je Sorte. */
  strainEnv?: StrainEnvPoint[];
  logs: GrowLog[];
  expectedYield: string;
}

export interface HallEntry {
  id: string;
  title: string;
  grower: string;
  avatar: string;
  strain: string;
  image: string;
  award: string;
  likes: number;
  comments: number;
  aspect: string;
}

export interface NotificationItem {
  id: string;
  type: "grow" | "task" | "forum" | "shop" | "ai" | "system";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  desc: string;
  color: string;
  icon: string;
  uses: number;
  rating: number;
}

export interface SoilComponent {
  name: string;
  pct: number;
  color: string;
}

export interface SoilRecipe {
  id: string;
  name: string;
  author: string;
  avatar: string;
  stars: number;
  forks: number;
  contributors: number;
  updated: string;
  base: string;
  diff: { add?: string[]; remove?: string[] };
  components: SoilComponent[];
  ec: number;
  ph: number;
}

export interface SocialPost {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  time: string;
  text: string;
  image?: string;
  likes: number;
  comments: number;
  shares: number;
  liked?: boolean;
  tags: string[];
  /** Eigener Beitrag (Server) – z. B. um „Melden“ auszublenden. */
  mine?: boolean;
  /** Gehört zu einer Community (B-61). */
  communityId?: string;
  /** Ausgeblendet – nur die Moderation sieht solche Beiträge. */
  hidden?: boolean;
}
