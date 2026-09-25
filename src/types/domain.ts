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
  start: number; // day
  end: number;
  done: boolean;
}

export interface EnvPoint {
  day: number;
  temp: number;
  rh: number;
  vpd: number;
  ec: number;
}

export interface GrowLog {
  id: string;
  day: number;
  date: string;
  title: string;
  text: string;
  tag: "Gießen" | "Dünger" | "Training" | "Beobachtung" | "Schädling" | "Ernte";
}

export interface Grow {
  id: string;
  name: string;
  strain: string;
  breeder: string;
  type: Type;
  medium: string;
  startDate: string;
  day: number;
  totalDays: number;
  phase: string;
  phaseIndex: number;
  progress: number;
  health: number;
  cover: string;
  gallery: string[];
  phases: GrowPhase[];
  env: EnvPoint[];
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
}
