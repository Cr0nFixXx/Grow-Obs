import type {
  ActivityItem, Breeder, Community, CommunityDetail, CommunityRole, CreateCommunityInput,
  CreateGrowInput, CreatePostInput, CreateThreadInput,
  Grow, GrowLog, HallEntry, Product, SeedOffer, SocialPost, Strain,
} from "@/types";

export interface WikiArticleBrief {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  readMin: number;
  author: string;
  updated: string;
  version: string;
  tags: string[];
}

export interface WikiArticleDetail extends WikiArticleBrief {
  body: string[];
}

export interface ForumComment {
  id: string;
  author: string;
  avatar: string;
  body: string;
  votes: number;
  ago: string;
  replies?: ForumComment[];
}

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface ConversationItem {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
  last: string;
  time: string;
  unread: number;
}

export interface NotificationItem {
  id: string;
  type: "grow" | "task" | "forum" | "shop" | "ai" | "system";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

export interface WikiService {
  categories(): Promise<string[]>;
  list(): Promise<WikiArticleBrief[]>;
  get(id: string): Promise<WikiArticleDetail | undefined>;
}

export interface ForumService {
  subs(): Promise<string[]>;
  listThreads(): Promise<ForumThreadBrief[]>;
  getThread(id: string): Promise<ForumThreadDetail | undefined>;
  vote(threadId: string, delta: 1 | -1): Promise<void>;
  createThread(input: CreateThreadInput): Promise<ForumThreadBrief>;
  addComment(threadId: string, text: string): Promise<ForumComment>;
}

export interface ForumThreadBrief {
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

export interface ForumThreadDetail extends ForumThreadBrief {
  commentsList: ForumComment[];
}

export interface ChatService {
  listConversations(): Promise<ConversationItem[]>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(conversationId: string, text: string): Promise<ChatMessage>;
}

export interface NotificationService {
  list(): Promise<NotificationItem[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

/**
 * Service-Verträge (Schnittstellen) für jede Domäne.
 *
 * PATTERN: Jede Domäne bekommt ein `XxxService`-Interface mit async-Methoden.
 * Es gibt genau zwei Implementierungen:
 *   - `mock.ts`    → statische Mock-Daten (Default, kein Server nötig)
 *   - `api.ts`     → echtes Backend via `http`-Client
 * Die Factory `index.ts` wählt anhand von `config.useMock` die passende aus.
 * Neue Domäne: Interface hier ergänzen + in beiden Impl. + `Services` aufnehmen.
 */

export interface GrowService {
  list(): Promise<Grow[]>;
  get(id: string): Promise<Grow | undefined>;
  create(input: CreateGrowInput): Promise<Grow>;
  addLog(growId: string, log: Omit<GrowLog, "id">): Promise<void>;
}

export interface SocialService {
  listPosts(): Promise<SocialPost[]>;
  createPost(input: CreatePostInput): Promise<SocialPost>;
  toggleLike(postId: string): Promise<SocialPost>;
}

export interface StrainService {
  list(): Promise<Strain[]>;
}

export interface ProductService {
  list(): Promise<Product[]>;
  categories(): Promise<string[]>;
  offers(): Promise<SeedOffer[]>;
}

export interface BreederService {
  list(): Promise<Breeder[]>;
  get(id: string): Promise<Breeder | undefined>;
}

export interface HallService {
  list(): Promise<HallEntry[]>;
}

export interface ActivityService {
  list(): Promise<ActivityItem[]>;
}

export interface CommunityService {
  list(): Promise<Community[]>;
  get(id: string): Promise<CommunityDetail | undefined>;
  create(input: CreateCommunityInput): Promise<CommunityDetail>;
  joinPublic(id: string): Promise<void>;
  createInvite(id: string): Promise<{ code: string; expiresAt: string }>;
  joinByCode(code: string): Promise<CommunityDetail>;
  setMemberRole(communityId: string, userId: string, role: CommunityRole): Promise<void>;
}

/* ----------------------------- Dev-Admin (Betreiber) ----------------------------- */
export interface ServiceHealth {
  ok: boolean;
  hint: string;
  latencyMs?: number | null;
}

export interface SystemHealth {
  ok: boolean;
  mode: string;
  latencyMs: number;
  version: string;
  services: {
    api: ServiceHealth;
    db: ServiceHealth;
    storage: ServiceHealth;
    ai: ServiceHealth;
  };
}

export interface AdminStats {
  users: number;
  grows: number;
  activeGrows: number;
  posts: number;
  threads: number;
  comments: number;
  strains: number;
  products: number;
  wikiArticles: number;
  hallEntries: number;
  notifications: number;
}

export type AdminRole = "member" | "moderator" | "admin" | "platform_admin";

export interface AdminUser {
  id: string;
  name: string;
  handle: string;
  email: string;
  role: AdminRole;
  level: number;
  grows: number;
  status: string;
}

export interface AdminContentItem {
  id: string;
  type: "thread" | "post";
  title?: string;
  text?: string;
  createdAt: string;
}

export interface AdminService {
  health(): Promise<SystemHealth>;
  stats(): Promise<AdminStats>;
  users(q?: string): Promise<AdminUser[]>;
  setRole(userId: string, role: AdminRole): Promise<void>;
  content(): Promise<AdminContentItem[]>;
  deleteThread(id: string): Promise<void>;
  deletePost(id: string): Promise<void>;
}

/** Die gesamte Service-Registry (Dependency-Container). */
export interface Services {
  grows: GrowService;
  social: SocialService;
  strains: StrainService;
  wiki: WikiService;
  forum: ForumService;
  chat: ChatService;
  notifications: NotificationService;
  products: ProductService;
  breeders: BreederService;
  hall: HallService;
  activity: ActivityService;
  communities: CommunityService;
  admin: AdminService;
}
