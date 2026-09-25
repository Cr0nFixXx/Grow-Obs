import { http } from "@/lib/api";
import type {
  ActivityItem, Breeder, Community, CommunityDetail, CreateCommunityInput, CreateThreadInput, Grow, HallEntry, Product, SeedOffer,
  SocialPost, Strain, Task,
} from "@/types";
import type {
  ActivityService,
  AdminContentItem,
  AdminService,
  AdminStats,
  AdminUser,
  BreederService,
  CommunityService,
  ChatMessage,
  ChatService,
  ConversationItem,
  ForumComment,
  ForumService,
  ForumThreadBrief,
  ForumThreadDetail,
  TaskService,
  MediaService,
  Release,
  ReleaseService,
  FeatureService,
  CommentKind,
  CommentService,
  ItemComment,
  VoteResult,
  MediaUpload,
  GrowService,
  HallService,
  NotificationItem,
  NotificationService,
  ProductService,
  Services,
  SocialService,
  StrainService,
  SystemHealth,
  WikiArticleBrief,
  WikiArticleDetail,
  WikiService,
} from "./interfaces";

/**
 * API-Implementierungen (sprechen das echte Backend an).
 * Aktiv sobald `VITE_API_URL` gesetzt ist (siehe `.env.example`).
 * Die Endpunkte hier sind die erwartete REST-Konvention des Backends.
 */
const growService: GrowService = {
  list: () => http.get<Grow[]>("/grows"),
  get: (id) => http.get<Grow>(`/grows/${id}`),
  create: (input) => http.post<Grow>("/grows", input),
  addLog: (growId, log) => http.post<void>(`/grows/${growId}/logs`, log),
  addPhoto: (growId, url) => http.post<Grow>(`/grows/${growId}/photos`, { url }),
};

const socialService: SocialService = {
  listPosts: () => http.get<SocialPost[]>("/social/posts"),
  createPost: (input) => http.post<SocialPost>("/social/posts", input),
  toggleLike: (postId) => http.post<SocialPost>(`/social/posts/${postId}/like`),
};

const strainService: StrainService = {
  // Backend kennt (noch) keine persönliche Sammlung → Katalog inkl. Community-Sorten.
  list: () => http.get<Strain[]>("/strains"),
  catalog: () => http.get<Strain[]>("/strains"),
  collection: () => http.get<Strain[]>("/strains/collection"),
  toggleCollect: async (id) => (await http.post<{ collected: boolean }>(`/strains/${id}/collect`)).collected,
  create: (input) => http.post<Strain>("/strains", input),
};

/** Bilder in PostgreSQL (apps/api/src/routes/media.ts). */
const mediaService: MediaService = {
  upload: (image) => http.upload<MediaUpload>("/media", image),
};

const commentPath = (kind: CommentKind, id: string) => (kind === "post" ? `/social/posts/${id}/comments` : `/hall/${id}/comments`);
const commentService: CommentService = {
  list: (kind, id) => http.get<ItemComment[]>(commentPath(kind, id)),
  add: (kind, id, text) => http.post<ItemComment>(commentPath(kind, id), { text }),
};

type Overrides = { overrides: Record<string, boolean> };
const featureService: FeatureService = {
  global: true,
  get: async () => (await http.get<Overrides>("/features")).overrides,
  set: async (key, enabled) => (await http.put<Overrides>(`/admin/features/${encodeURIComponent(key)}`, { enabled })).overrides,
  reset: async () => (await http.delete<Overrides>("/admin/features")).overrides,
};

const releaseService: ReleaseService = {
  list: () => http.get<Release[]>("/releases"),
  create: (input) => http.post<Release>("/admin/releases", input),
  remove: async (id) => { await http.delete<void>(`/admin/releases/${id}`); },
};

/** Persönliche Tasks (apps/api/src/routes/tasks.ts). */
const taskService: TaskService = {
  list: () => http.get<Task[]>("/tasks"),
  create: (input) => http.post<Task>("/tasks", input),
  toggle: (id) => http.post<Task>(`/tasks/${id}/toggle`),
};

const wikiService: WikiService = {
  categories: () => http.get<string[]>("/wiki/categories"),
  list: () => http.get<WikiArticleBrief[]>("/wiki"),
  get: (id) => http.get<WikiArticleDetail>(`/wiki/${id}`),
  create: (input) => http.post<WikiArticleBrief>("/wiki", input),
};

const forumService: ForumService = {
  subs: () => http.get<string[]>("/forum/subs"),
  listThreads: () => http.get<ForumThreadBrief[]>("/forum/threads"),
  getThread: (id) => http.get<ForumThreadDetail>(`/forum/threads/${id}`),
  vote: (threadId, delta) => http.post<VoteResult>(`/forum/threads/${threadId}/vote`, { delta }),
  voteComment: (commentId, delta) => http.post<VoteResult>(`/forum/comments/${commentId}/vote`, { delta }),
  createThread: (input: CreateThreadInput) => http.post<ForumThreadBrief>("/forum/threads", input),
  addComment: (threadId, text, parentId) => http.post<ForumComment>(`/forum/threads/${threadId}/comments`, parentId ? { text, parentId } : { text }),
};

const chatService: ChatService = {
  listConversations: () => http.get<ConversationItem[]>("/chat"),
  getMessages: (id) => http.get<ChatMessage[]>(`/chat/${id}/messages`),
  sendMessage: (id, text, image) => http.post<ChatMessage>(`/chat/${id}/messages`, image ? { text, image } : { text }),
};

const notificationService: NotificationService = {
  list: () => http.get<NotificationItem[]>("/notifications"),
  markRead: (id) => http.post<void>(`/notifications/${id}/read`),
  markAllRead: () => http.post<void>("/notifications/read-all"),
};

const productService: ProductService = {
  list: () => http.get<Product[]>("/products"),
  categories: () => http.get<string[]>("/products/categories"),
  offers: () => http.get<SeedOffer[]>("/offers"),
};

const breederService: BreederService = {
  list: () => http.get<Breeder[]>("/breeders"),
  get: (id) => http.get<Breeder>(`/breeders/${id}`),
};

const hallService: HallService = {
  list: () => http.get<HallEntry[]>("/hall"),
};

const activityService: ActivityService = {
  list: () => http.get<ActivityItem[]>("/me/activity"),
};

const communityService: CommunityService = {
  list: () => http.get<Community[]>("/communities"),
  get: (id) => http.get<CommunityDetail>(`/communities/${id}`),
  create: (input: CreateCommunityInput) => http.post<CommunityDetail>("/communities", input),
  joinPublic: (id) => http.post<void>(`/communities/${id}/join`),
  createInvite: (id) => http.post<{ code: string; expiresAt: string }>(`/communities/${id}/invites`),
  joinByCode: (code) => http.post<CommunityDetail>("/communities/join", { code }),
  setMemberRole: (communityId, userId, role) => http.patch<void>(`/communities/${communityId}/members/${userId}/role`, { role }),
};

const adminService: AdminService = {
  health: () => http.get<SystemHealth>("/admin/health"),
  stats: () => http.get<AdminStats>("/admin/stats"),
  users: (q) => http.get<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  setRole: (userId, role) => http.patch<void>(`/admin/users/${userId}/role`, { role }),
  content: () => http.get<AdminContentItem[]>("/admin/content"),
  deleteThread: (id) => http.delete<void>(`/admin/threads/${id}`),
  deletePost: (id) => http.delete<void>(`/admin/posts/${id}`),
};

export const apiServices: Services = {
  grows: growService,
  social: socialService,
  strains: strainService,
  tasks: taskService,
  media: mediaService,
  comments: commentService,
  features: featureService,
  releases: releaseService,
  wiki: wikiService,
  forum: forumService,
  chat: chatService,
  notifications: notificationService,
  products: productService,
  breeders: breederService,
  hall: hallService,
  activity: activityService,
  communities: communityService,
  admin: adminService,
};
