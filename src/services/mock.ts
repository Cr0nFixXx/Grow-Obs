import { currentUser, grows as seedGrows, myStrainCollection, socialPosts as seedPosts } from "@/mocks/data";
import { dbGet, dbSet } from "@/lib/db";
import type { Grow, SocialPost } from "@/types";
import type { GrowService, Services, SocialService, StrainService } from "./interfaces";

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

export const mockServices: Services = {
  grows: growService,
  social: socialService,
  strains: strainService,
};
