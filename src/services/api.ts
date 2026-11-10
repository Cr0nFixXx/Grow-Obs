import { http } from "@/lib/api";
import type {
  ActivityItem, BannedMember, Breeder, Community, CommunityDetail, CreateCommunityInput, CreateThreadInput, EnvPoint, Grow, GrowLog, HallEntry, MemberActivityItem, MemberGrowBrief, Product, SeedOffer,
  ReportPage, SocialPost, Strain, Task,
} from "@/types";
import type {
  ActivityService,
  FollowRequest,
  FollowState,
  GroupDetail,
  MemberPerson,
  MemberProfile,
  MemberService,
  InviteResult,
  MyGroupInvite,
  AdminContentItem,
  AdminService,
  AdminStats,
  AdminUser,
  ModerationLogEntry,
  PlatformModerationService,
  BreederService,
  CommunityService,
  ChatMessage,
  ChatService,
  ChatPerson,
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
  UploadConfig,
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
  addLog: (growId, log) => http.post<GrowLog>(`/grows/${growId}/logs`, log),
  updateLog: (growId, logId, patch) => http.patch<GrowLog>(`/grows/${growId}/logs/${logId}`, patch),
  deleteLog: async (growId, logId) => { await http.delete<void>(`/grows/${growId}/logs/${logId}`); },
  updatePhoto: (growId, photoId, patch) => http.patch<Grow>(`/grows/${growId}/photos/${photoId}`, patch),
  deletePhoto: (growId, photoId) => http.delete<Grow>(`/grows/${growId}/photos/${photoId}`),
  saveEnv: (growId, input) => http.put<EnvPoint>(`/grows/${growId}/env`, input),
  deleteEnv: async (growId, date) => { await http.delete<void>(`/grows/${growId}/env/${date}`); },
  addPhoto: (growId, url) => http.post<Grow>(`/grows/${growId}/photos`, { url }),
  update: (growId, patch) => http.patch<Grow>(`/grows/${growId}`, patch),
  setPhase: (growId, phase) => http.post<Grow>(`/grows/${growId}/phase`, { phase }),
  finish: (growId, input) => http.post<Grow>(`/grows/${growId}/finish`, input),
  reopen: (growId) => http.post<Grow>(`/grows/${growId}/reopen`),
  archive: (growId, archived) => http.post<Grow>(`/grows/${growId}/${archived ? "archive" : "unarchive"}`),
  remove: async (growId) => { await http.delete<void>(`/grows/${growId}`); },
};

const socialService: SocialService = {
  listPosts: (communityId) => http.get<SocialPost[]>(communityId ? `/social/posts?communityId=${encodeURIComponent(communityId)}` : "/social/posts"),
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
  upload: (blob, options) => http.upload<MediaUpload>(options ? `/media?kind=file&name=${encodeURIComponent(options.name)}` : "/media", blob),
  config: () => http.get<UploadConfig>("/media/config"),
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
  getMessages: (id, topicId) => http.get<ChatMessage[]>(`/chat/${id}/messages${topicId ? `?topicId=${topicId}` : ""}`),
  sendMessage: (id, text, attachments, topicId, replyTo, statusReply) => http.post<ChatMessage>(`/chat/${id}/messages`, { text, ...(attachments?.length ? { attachments: attachments.map((a) => a.path) } : {}), ...(topicId ? { topicId } : {}), ...(replyTo ? { replyTo } : {}), ...(statusReply ? { statusReply: true } : {}) }),
  deleteMessage: async (id, messageId) => { await http.delete<void>(`/chat/${id}/messages/${messageId}`); },
  startDirect: (userId) => http.post<ConversationItem>("/chat", { userId }),
  markRead: async (id, topicId) => { await http.post<void>(`/chat/${id}/read`, topicId ? { topicId } : {}); },
  unreadTotal: async () => (await http.get<{ total: number }>("/chat/unread")).total,
  searchPeople: (query) => http.get<ChatPerson[]>(`/chat/users?q=${encodeURIComponent(query)}`),
  createGroup: (input) => http.post<GroupDetail & { skipped: InviteResult["skipped"] }>("/chat/groups", input),
  getGroup: (id) => http.get<GroupDetail>(`/chat/groups/${id}`),
  updateGroup: (id, patch) => http.patch<GroupDetail>(`/chat/groups/${id}`, patch),
  inviteToGroup: (id, userIds) => http.post<InviteResult>(`/chat/groups/${id}/invites`, { userIds }),
  revokeInvite: async (id, inviteId) => { await http.delete<void>(`/chat/groups/${id}/invites/${inviteId}`); },
  listInvites: () => http.get<MyGroupInvite[]>("/chat/invites"),
  acceptInvite: (inviteId) => http.post<{ conversationId: string }>(`/chat/invites/${inviteId}/accept`, {}),
  declineInvite: async (inviteId) => { await http.post<void>(`/chat/invites/${inviteId}/decline`, {}); },
  removeMember: async (id, userId) => { await http.delete<void>(`/chat/groups/${id}/members/${userId}`); },
  leaveGroup: async (id) => { await http.post<void>(`/chat/groups/${id}/leave`, {}); },
  createTopic: (id, input) => http.post<GroupDetail>(`/chat/groups/${id}/topics`, input),
  updateTopic: (id, topicId, patch) => http.patch<GroupDetail>(`/chat/groups/${id}/topics/${topicId}`, patch),
  deleteTopic: async (id, topicId) => { await http.delete<void>(`/chat/groups/${id}/topics/${topicId}`); },
  moveTopic: (id, topicId, direction) => http.post<GroupDetail>(`/chat/groups/${id}/topics/${topicId}/move`, { direction }),
  setTopicMembers: (id, topicId, userIds) => http.put<GroupDetail>(`/chat/groups/${id}/topics/${topicId}/members`, { userIds }),
  muteTopic: async (id, topicId, muted) => { await http.put<void>(`/chat/groups/${id}/topics/${topicId}/me`, { muted }); },
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
  kick: (communityId, userId, ban) => http.delete<void>(`/communities/${communityId}/members/${userId}${ban ? "?ban=true" : ""}`),
  bans: (communityId) => http.get<BannedMember[]>(`/communities/${communityId}/bans`),
  unban: (communityId, userId) => http.delete<void>(`/communities/${communityId}/bans/${userId}`),
  setHidden: (communityId, kind, targetId, hidden) =>
    http.post<void>(`/communities/${communityId}/${kind === "post" ? "posts" : "comments"}/${targetId}/${hidden ? "hide" : "unhide"}`),
  report: (communityId, input) => http.post<{ duplicate: boolean }>(`/communities/${communityId}/reports`, input),
  reports: (communityId, status, offset = 0) => http.get<ReportPage>(`/communities/${communityId}/reports?status=${status}&offset=${offset}`),
  resolveReport: (communityId, kind, targetId, action) => http.post<void>(`/communities/${communityId}/reports/resolve`, { kind, targetId, action }),
  leave: async (communityId) => { await http.post<unknown>(`/communities/${communityId}/leave`, {}); },
};

const platformModerationService: PlatformModerationService = {
  report: (input) => http.post<{ duplicate: boolean }>("/moderation/reports", input),
  queue: (status, offset = 0) => http.get<ReportPage>(`/moderation/reports?status=${status}&offset=${offset}`),
  resolve: async (kind, targetId, action) => { await http.post<unknown>("/moderation/reports/resolve", { kind, targetId, action }); },
  setHidden: async (kind, targetId, hidden) => { await http.post<unknown>("/moderation/hide", { kind, targetId, hidden }); },
};

const adminService: AdminService = {
  health: () => http.get<SystemHealth>("/admin/health"),
  stats: () => http.get<AdminStats>("/admin/stats"),
  users: (q) => http.get<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  verifyEmail: (userId) => http.post<void>(`/admin/users/${userId}/verify-email`),
  setRole: (userId, role) => http.patch<void>(`/admin/users/${userId}/role`, { role }),
  content: () => http.get<AdminContentItem[]>("/admin/content"),
  deleteThread: (id) => http.delete<void>(`/admin/threads/${id}`),
  deletePost: (id) => http.delete<void>(`/admin/posts/${id}`),
  ban: async (userId, reason) => { await http.post<unknown>(`/admin/users/${userId}/ban`, { ...(reason ? { reason } : {}) }); },
  unban: async (userId) => { await http.post<unknown>(`/admin/users/${userId}/unban`, {}); },
  deleteUser: async (userId, input) => { await http.delete<unknown>(`/admin/users/${userId}`, undefined, { ...input, confirm: "LÖSCHEN" }); },
  moderationLog: (offset = 0) => http.get<{ items: ModerationLogEntry[]; hasMore: boolean }>(`/admin/moderation-log?offset=${offset}`),
};

const memberService: MemberService = {
  get: (handle) => http.get<MemberProfile>(`/members/${encodeURIComponent(handle)}`),
  follow: async (handle) => (await http.post<{ status: FollowState }>(`/members/${encodeURIComponent(handle)}/follow`, {})).status,
  unfollow: async (handle) => { await http.delete<unknown>(`/members/${encodeURIComponent(handle)}/follow`); },
  followers: (handle) => http.get<MemberPerson[]>(`/members/${encodeURIComponent(handle)}/followers`),
  following: (handle) => http.get<MemberPerson[]>(`/members/${encodeURIComponent(handle)}/following`),
  grows: (handle) => http.get<MemberGrowBrief[]>(`/members/${encodeURIComponent(handle)}/grows`),
  grow: (handle, growId) => http.get<Grow>(`/members/${encodeURIComponent(handle)}/grows/${encodeURIComponent(growId)}`),
  activity: (handle) => http.get<MemberActivityItem[]>(`/members/${encodeURIComponent(handle)}/activity`),
  requests: () => http.get<FollowRequest[]>("/follows/requests"),
  accept: async (userId) => { await http.post<unknown>(`/follows/requests/${userId}/accept`, {}); },
  decline: async (userId) => { await http.post<unknown>(`/follows/requests/${userId}/decline`, {}); },
  removeFollower: async (userId) => { await http.delete<unknown>(`/follows/followers/${userId}`); },
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
  moderation: platformModerationService,
  members: memberService,
  admin: adminService,
};
