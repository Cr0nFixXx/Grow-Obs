import {
  activityFeed,
  breeders as seedBreeders,
  categories as productCategories,
  conversations as seedConversations,
  currentUser,
  forumSubs,
  forumThreads as seedThreads,
  grows as seedGrows,
  hallOfFame as seedHall,
  myStrainCollection,
  notifications as seedNotifications,
  products as seedProducts,
  sampleComments,
  seedOffers,
  socialPosts as seedPosts,
  wikiArticles,
  wikiCategories,
} from "@/mocks/data";
import { dbGet, dbSet } from "@/lib/db";
import type { Grow, SocialPost } from "@/types";
import type {
  ActivityService,
  BreederService,
  ChatMessage,
  ChatService,
  ConversationItem,
  ForumComment,
  ForumService,
  ForumThreadBrief,
  ForumThreadDetail,
  GrowService,
  HallService,
  NotificationService,
  ProductService,
  Services,
  SocialService,
  StrainService,
  WikiArticleBrief,
  WikiService,
} from "./interfaces";

/** Simuliert Netzwerk-Latenz (damit Loading-/Skeleton-Zustände realistisch sind). */
const delay = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- Social (mit IndexedDB-Persistenz) ---------- */
async function loadPosts(): Promise<SocialPost[]> {
  const saved = await dbGet<SocialPost[]>("social-posts").catch(() => undefined);
  return saved && saved.length ? saved : [...seedPosts];
}
async function savePosts(posts: SocialPost[]): Promise<void> {
  await dbSet("social-posts", posts).catch(() => {});
}

const socialService: SocialService = {
  async listPosts() {
    await delay();
    return loadPosts();
  },
  async createPost(input) {
    await delay();
    const post: SocialPost = {
      id: `sp-${Date.now()}`,
      author: currentUser.name,
      handle: currentUser.handle,
      avatar: currentUser.avatar,
      time: "gerade eben",
      text: input.text,
      image: input.image,
      likes: 0,
      comments: 0,
      shares: 0,
      tags: input.tags ?? [],
      liked: false,
    };
    const posts = await loadPosts();
    await savePosts([post, ...posts]);
    return post;
  },
  async toggleLike(postId) {
    await delay(120);
    const posts = await loadPosts();
    const next = posts.map((p) =>
      p.id === postId ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p
    );
    await savePosts(next);
    return next.find((p) => p.id === postId) as SocialPost;
  },
};

const growService: GrowService = {
  async list() {
    await delay();
    return [...seedGrows];
  },
  async get(id) {
    await delay(140);
    return seedGrows.find((g) => g.id === id);
  },
  async create(input) {
    await delay();
    return {
      id: `g-${Date.now()}`,
      name: input.name,
      strain: input.strain,
      breeder: input.breeder,
      type: "Hybrid",
      medium: input.medium,
      startDate: new Date().toISOString(),
      day: 0,
      totalDays: 84,
      phase: "Keimung",
      phaseIndex: 0,
      progress: 0,
      health: 95,
      cover: seedGrows[0].cover,
      gallery: [],
      expectedYield: "—",
      phases: [],
      env: [],
      logs: [],
    } as Grow;
  },
  async addLog(_growId, _log) {
    await delay(150);
    /* Mock: no-op (später: Grow-Logs im Backend persistieren) */
  },
};

const strainService: StrainService = {
  async list() {
    await delay();
    return [...myStrainCollection];
  },
};

const wikiService: WikiService = {
  async categories() {
    await delay(120);
    return [...wikiCategories];
  },
  async list() {
    await delay();
    return wikiArticles.map<WikiArticleBrief>(({ body: _b, ...rest }) => rest);
  },
  async get(id) {
    await delay();
    return wikiArticles.find((a) => a.id === id);
  },
};

/** In-Memory-Store: erstellte Threads/Kommentare überleben View-Wechsel (Session). */
const threadStore: { threads: ForumThreadBrief[]; comments: Record<string, ForumComment[]> } = {
  threads: seedThreads.map<ForumThreadBrief>((t) => ({
    id: t.id, title: t.title, sub: t.sub, author: t.author, avatar: t.avatar,
    votes: t.votes, comments: t.comments, ago: t.ago, excerpt: t.excerpt, tag: t.tag, top: t.top,
  })),
  comments: {},
};

function commentsFor(threadId: string): ForumComment[] {
  if (threadId in threadStore.comments) return threadStore.comments[threadId];
  return seedThreads.some((t) => t.id === threadId) ? sampleComments : [];
}

const forumService: ForumService = {
  async subs() {
    await delay(100);
    return [...forumSubs];
  },
  async listThreads() {
    await delay();
    return threadStore.threads.map((t) => ({ ...t }));
  },
  async getThread(id) {
    await delay();
    const t = threadStore.threads.find((x) => x.id === id);
    if (!t) return undefined;
    return { ...t, commentsList: commentsFor(id) } satisfies ForumThreadDetail;
  },
  async vote(_threadId, _delta) {
    await delay(120);
    // Mock: no-op
  },
  async createThread(input) {
    await delay();
    const t: ForumThreadBrief = {
      id: `t-${Date.now()}`,
      title: input.title,
      sub: input.sub,
      author: currentUser.name,
      avatar: currentUser.avatar,
      votes: 0,
      comments: 0,
      ago: "gerade eben",
      excerpt: input.text.slice(0, 140),
      tag: "Diskussion",
    };
    threadStore.threads = [t, ...threadStore.threads];
    return { ...t };
  },
  async addComment(threadId, text) {
    await delay(140);
    const t = threadStore.threads.find((x) => x.id === threadId);
    if (!t) throw new Error("Thread nicht gefunden");
    const c: ForumComment = {
      id: `c-${Date.now()}`,
      author: currentUser.name,
      avatar: currentUser.avatar,
      body: text,
      votes: 0,
      ago: "gerade eben",
    };
    threadStore.comments[threadId] = [...commentsFor(threadId), c];
    t.comments += 1;
    return { ...c };
  },
};

const chatService: ChatService = {
  async listConversations() {
    await delay();
    return seedConversations.map<ConversationItem>(({ messages: _m, ...rest }) => rest);
  },
  async getMessages(conversationId) {
    await delay();
    const c = seedConversations.find((x) => x.id === conversationId);
    return c ? [...c.messages] : [];
  },
  async sendMessage(_conversationId, text) {
    await delay(140);
    const msg: ChatMessage = { id: String(Date.now()), from: "me", text, time: "jetzt" };
    // Mock: no persistence
    return msg;
  },
};

const notificationService: NotificationService = {
  async list() {
    await delay();
    return [...seedNotifications];
  },
  async markRead(_id) {
    await delay(80);
    // Mock: no-op
  },
  async markAllRead() {
    await delay(100);
    // Mock: no-op
  },
};

const productService: ProductService = {
  async list() {
    await delay();
    return [...seedProducts];
  },
  async categories() {
    await delay(80);
    return [...productCategories];
  },
  async offers() {
    await delay(80);
    return [...seedOffers];
  },
};

const breederService: BreederService = {
  async list() {
    await delay();
    return [...seedBreeders];
  },
  async get(id) {
    await delay(120);
    return seedBreeders.find((b) => b.id === id);
  },
};

const hallService: HallService = {
  async list() {
    await delay();
    return [...seedHall];
  },
};

const activityService: ActivityService = {
  async list() {
    await delay();
    return activityFeed.map((a) => ({
      id: a.id, who: a.who, avatar: a.avatar, action: a.action,
      target: a.target, time: a.time, icon: a.icon, color: a.color,
    }));
  },
};

export const mockServices: Services = {
  grows: growService,
  social: socialService,
  strains: strainService,
  wiki: wikiService,
  forum: forumService,
  chat: chatService,
  notifications: notificationService,
  products: productService,
  breeders: breederService,
  hall: hallService,
  activity: activityService,
};
