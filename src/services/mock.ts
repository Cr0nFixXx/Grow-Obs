import {
  activityFeed,
  AVATARS,
  breeders as seedBreeders,
  categories as productCategories,
  conversations as seedConversations,
  currentUser,
  forumSubs,
  forumThreads as seedThreads,
  grows as seedGrows,
  hallOfFame as seedHall,
  myStrainCollection,
  strains as catalogStrains,
  notifications as seedNotifications,
  products as seedProducts,
  sampleComments,
  seedOffers,
  socialPosts as seedPosts,
  upcomingTasks,
  wikiArticles,
  wikiCategories,
} from "@/mocks/data";
import { dbGet, dbSet } from "@/lib/db";
import { APP_VERSION } from "@/lib/app-version";
import { GROW_PHASE_NAMES, dayDiff, todayLocal, vpdKpa } from "@/lib/grows";
import type { EnvPoint, Grow, GrowLog, GrowStrain, SocialPost, Strain, TargetKey, TargetRange, Task } from "@/types";
import type { BannedMember, CommunityDetail, ReportGroup, ReportPage } from "@/types";
import type {
  ActivityService,
  FollowRequest,
  FollowState,
  MemberPerson,
  MemberProfile,
  MemberService,
  ProfileVisibility,
  AdminContentItem,
  AdminService,
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
  GrowService,
  TaskService,
  MediaService,
  Release,
  ReleaseService,
  FeatureService,
  CommentService,
  ItemComment,
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

/** Community-Feeds (Mock, Session): Beiträge je Community-ID. */
const communityPostStore: Record<string, SocialPost[]> = {};
const findCommunityPost = (postId: string) => {
  for (const [communityId, list] of Object.entries(communityPostStore)) {
    const post = list.find((p) => p.id === postId);
    if (post) return { communityId, post };
  }
  return undefined;
};

const socialService: SocialService = {
  async listPosts(communityId) {
    await delay();
    if (communityId) {
      const moderator = isMockModerator(communityId);
      return (communityPostStore[communityId] ?? []).filter((p) => moderator || !p.hidden).map((p) => ({ ...p }));
    }
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
      mine: true,
      ...(input.communityId ? { communityId: input.communityId } : {}),
    };
    if (input.communityId) {
      (communityPostStore[input.communityId] ??= []).unshift(post);
      return { ...post };
    }
    const posts = await loadPosts();
    await savePosts([post, ...posts]);
    return post;
  },
  async toggleLike(postId) {
    await delay(120);
    const inCommunity = findCommunityPost(postId);
    if (inCommunity) {
      const p = inCommunity.post;
      p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
      return { ...p };
    }
    const posts = await loadPosts();
    const next = posts.map((p) =>
      p.id === postId ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p
    );
    await savePosts(next);
    return next.find((p) => p.id === postId) as SocialPost;
  },
};

/** Session-Store: neue Grows/Logs bleiben bis zum Reload sichtbar. */
const sumGrams = (values: (number | null)[]) => { const v = values.filter((n): n is number => n !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const strainTexts = (list: GrowStrain[]) => ({ strainName: list.map((x) => x.name).join(", "), breeder: [...new Set(list.map((x) => x.breeder).filter(Boolean))].join(", ") });
let strainSeq = 0;
/** B-101: Sorten bekommen stabile IDs; bekannte IDs bleiben, alles andere erhält eine neue. */
const withStrainIds = (list: GrowStrain[], existing: GrowStrain[]): GrowStrain[] => {
  const known = new Set(existing.map((x) => x.id));
  const used = new Set<string>();
  return list.map((x) => {
    const id = x.id && known.has(x.id) && !used.has(x.id) ? x.id : `st-${Date.now()}-${++strainSeq}`;
    used.add(id);
    return { ...x, id };
  });
};
const growStore: Grow[] = seedGrows.map((g) => ({ ...g, strains: g.strains.map((x, i) => ({ ...x, id: x.id ?? `${g.id}-s${i}` })), logs: [...g.logs], env: [...g.env], strainEnv: [...(g.strainEnv ?? [])], photos: [...g.photos] }));

/** Eine Auswahl von Sorten-IDs prüfen: nur bekannte, ohne Doppelte. */
function mockStrainIds(grow: Grow, ids: string[] | undefined): string[] {
  const list = [...new Set(ids ?? [])];
  if (list.some((id) => !grow.strains.some((x) => x.id === id))) throw new Error("Unbekannte Sorte");
  return list;
}

function mockGrow(id: string): Grow {
  const grow = growStore.find((g) => g.id === id);
  if (!grow) throw new Error("Grow nicht gefunden");
  return grow;
}

/** Phasenliste wie die API sie liefert; Startdaten bereits begonnener Phasen bleiben erhalten. */
function mockPhases(index: number, status: Grow["status"], previous: Grow["phases"] = []): Grow["phases"] {
  const today = todayLocal();
  return GROW_PHASE_NAMES.map((label, i) => {
    const before = previous.find((p) => p.label === label);
    return {
      key: label.toLowerCase().replace("ü", "ue"),
      label,
      done: status === "harvested" ? true : i < index,
      active: status === "active" && i === index,
      startedOn: before?.startedOn ?? (i === index && status === "active" ? today : null),
    };
  });
}

const sortLogs = (logs: GrowLog[]) => [...logs].sort((a, b) => b.date.localeCompare(a.date));

/** Datum eines Tagebuch-Eintrags: Standard heute, nie vor dem Start und nie in der Zukunft (wie die API). */
function mockDiaryDate(grow: Grow, date?: string): string {
  const value = date ?? todayLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ungültiges Datum");
  if (value < grow.startDate.slice(0, 10)) throw new Error("Das Datum liegt vor dem Start des Grows");
  if (value > todayLocal()) throw new Error("Das Datum liegt in der Zukunft");
  return value;
}

/** VPD wie die API: aus Temperatur und Luftfeuchte, nie gespeichert. */
const withVpd = (e: EnvPoint, leafOffset: number): EnvPoint => ({ ...e, vpd: e.temp != null && e.rh != null ? vpdKpa(e.temp, e.rh, leafOffset) : null });

/** Titelbild aus der Galerie ableiten. */
function mockCover(grow: Grow) {
  grow.cover = grow.photos.find((p) => p.cover)?.url ?? "";
}

/** Tag und Fortschritt aus dem Startdatum (wie in der API). */
function mockRecount(grow: Grow) {
  const [sy, sm, sd] = grow.startDate.slice(0, 10).split("-").map(Number);
  const end = grow.endedOn ?? todayLocal();
  const [ey, em, ed] = end.slice(0, 10).split("-").map(Number);
  grow.day = Math.max(0, Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000));
  grow.progress = grow.status === "harvested" ? 100 : Math.min(100, Math.round((grow.day / Math.max(1, grow.totalDays)) * 100));
}

const growService: GrowService = {
  async list() {
    await delay();
    return [...growStore];
  },
  async get(id) {
    await delay(140);
    return growStore.find((g) => g.id === id);
  },
  async create(input) {
    await delay();
    const newStrains: GrowStrain[] = withStrainIds(input.strains?.length ? input.strains : input.strain ? [{ name: input.strain, breeder: input.breeder && input.breeder !== "Unbekannt" ? input.breeder : "", plants: null, wetG: null, dryG: null }] : [], []);
    const grow = {
      id: `g-${Date.now()}`,
      name: input.name,
      strain: strainTexts(newStrains).strainName,
      strains: newStrains,
      breeder: strainTexts(newStrains).breeder,
      type: input.type ?? "Hybrid",
      medium: input.medium,
      startDate: input.startDate ?? todayLocal(),
      day: 0,
      totalDays: 84,
      phase: "Keimung",
      phaseIndex: 0,
      progress: 0,
      status: "active",
      condition: "gesund",
      visibility: input.visibility ?? "private",
      archived: false,
      endedOn: null,
      harvest: null,
      cover: seedGrows[0].cover,
      photos: [],
      leafOffset: 2,
      targets: {},
      expectedYield: "—",
      phases: mockPhases(0, "active"),
      env: [],
      logs: [],
    } as Grow;
    mockRecount(grow);
    growStore.unshift(grow);
    return { ...grow };
  },
  async update(growId, patch) {
    await delay(150);
    const grow = mockGrow(growId);
    const { targets, strains: strainsIn, ...fields } = patch;
    Object.assign(grow, fields);
    const before = grow.strains;
    if (strainsIn) {
      grow.strains = withStrainIds(strainsIn, before);
      Object.assign(grow, { strain: strainTexts(strainsIn).strainName, breeder: strainTexts(strainsIn).breeder });
      if (strainsIn.some((x) => x.wetG !== null || x.dryG !== null) && grow.harvest) grow.harvest = { ...grow.harvest, wetG: sumGrams(strainsIn.map((x) => x.wetG)), dryG: sumGrams(strainsIn.map((x) => x.dryG)) };
    } else if (fields.strain !== undefined) {
      grow.strains = fields.strain ? [{ id: grow.strains.length === 1 ? grow.strains[0].id : `st-${Date.now()}-${++strainSeq}`, name: fields.strain, breeder: grow.breeder === "Unbekannt" ? "" : grow.breeder, plants: grow.strains.length === 1 ? grow.strains[0].plants : null, wetG: null, dryG: null }] : [];
    }
    // Weniger Pflanzen: pH/EC nicht mehr vorhandener Einzelpflanzen entfallen (B-104).
    grow.strainEnv = (grow.strainEnv ?? []).filter((x) => (x.plant ?? 0) === 0 || (x.plant ?? 0) <= (grow.strains.find((s) => s.id === x.strainId)?.plants ?? 0));
    // Entfernte Sorten: Einträge/Fotos werden „ganzer Grow“, pH/EC wandert in den Tageswert (vorhandener Wert gewinnt).
    const gone = new Set(before.map((x) => x.id).filter((id) => !grow.strains.some((x) => x.id === id)));
    if (gone.size) {
      grow.logs = grow.logs.map((l) => (l.strainIds?.some((id) => gone.has(id!)) ? { ...l, strainIds: l.strainIds.filter((id) => !gone.has(id)) } : l));
      grow.photos = grow.photos.map((p) => (p.strainIds?.some((id) => gone.has(id)) ? { ...p, strainIds: p.strainIds.filter((id) => !gone.has(id)) } : p));
      for (const e of (grow.strainEnv ?? []).filter((x) => gone.has(x.strainId) && (x.plant ?? 0) === 0)) {
        const whole = grow.env.find((x) => x.date === e.date);
        if (whole) grow.env = grow.env.map((x) => (x === whole ? { ...x, ph: x.ph ?? e.ph, ec: x.ec ?? e.ec } : x));
        else grow.env = [...grow.env, { day: e.day, date: e.date, temp: null, rh: null, vpd: null, ph: e.ph, ec: e.ec }].sort((a, b) => a.date.localeCompare(b.date));
      }
      grow.strainEnv = (grow.strainEnv ?? []).filter((x) => !gone.has(x.strainId));
    }
    if (targets) {
      const next = { ...grow.targets };
      for (const [key, value] of Object.entries(targets) as [TargetKey, TargetRange | null | "default"][]) {
        if (value === "default") delete next[key];
        else next[key] = value;
      }
      grow.targets = next;
    }
    mockRecount(grow);
    if (patch.leafOffset !== undefined) grow.env = grow.env.map((e) => withVpd(e, grow.leafOffset));
    return { ...grow };
  },
  async setPhase(growId, phase) {
    await delay(120);
    const grow = mockGrow(growId);
    if (grow.status !== "active") throw new Error("Der Grow ist abgeschlossen – bitte zuerst wieder aufnehmen");
    const index = GROW_PHASE_NAMES.indexOf(phase as (typeof GROW_PHASE_NAMES)[number]);
    if (index < 0) throw new Error("Ungültige Phase");
    grow.phase = phase;
    grow.phaseIndex = index;
    grow.phases = mockPhases(index, "active", grow.phases);
    return { ...grow };
  },
  async finish(growId, input) {
    await delay(150);
    const grow = mockGrow(growId);
    const harvested = input.outcome === "harvested";
    grow.status = input.outcome;
    grow.endedOn = input.date ?? grow.endedOn ?? todayLocal();
    if (input.strainWeights) {
      if (input.strainWeights.length !== grow.strains.length) throw new Error("Die Gewichte passen nicht zur Sortenliste");
      grow.strains = grow.strains.map((x, i) => ({ ...x, wetG: harvested ? input.strainWeights![i].wetG : null, dryG: harvested ? input.strainWeights![i].dryG : null }));
      input = { ...input, wetG: sumGrams(grow.strains.map((x) => x.wetG)), dryG: sumGrams(grow.strains.map((x) => x.dryG)) };
    } else if (!harvested) {
      grow.strains = grow.strains.map((x) => ({ ...x, wetG: null, dryG: null }));
    }
    grow.harvest = { wetG: harvested ? (input.wetG !== undefined ? input.wetG : (grow.harvest?.wetG ?? null)) : null, dryG: harvested ? (input.dryG !== undefined ? input.dryG : (grow.harvest?.dryG ?? null)) : null, note: input.note ?? grow.harvest?.note ?? "" };
    grow.phases = mockPhases(grow.phaseIndex, harvested ? "harvested" : "aborted", grow.phases);
    mockRecount(grow);
    return { ...grow };
  },
  async reopen(growId) {
    await delay(120);
    const grow = mockGrow(growId);
    grow.status = "active";
    grow.endedOn = null;
    grow.harvest = null;
    grow.phases = mockPhases(grow.phaseIndex, "active", grow.phases);
    mockRecount(grow);
    return { ...grow };
  },
  async archive(growId, archived) {
    await delay(100);
    const grow = mockGrow(growId);
    grow.archived = archived;
    return { ...grow };
  },
  async remove(growId) {
    await delay(150);
    const at = growStore.findIndex((g) => g.id === growId);
    if (at >= 0) growStore.splice(at, 1);
  },
  async addPhoto(growId, url, strainIds) {
    await delay(150);
    const grow = mockGrow(growId);
    const ids = mockStrainIds(grow, strainIds);
    grow.photos = [...grow.photos, { id: `p-${Date.now()}-${grow.photos.length}`, url, caption: "", cover: grow.photos.length === 0, strainIds: ids, date: todayLocal(), day: dayDiff(grow.startDate, todayLocal()) }];
    mockCover(grow);
    return { ...grow };
  },
  async updatePhoto(growId, photoId, patch) {
    await delay(120);
    const grow = mockGrow(growId);
    if (!grow.photos.some((p) => p.id === photoId)) throw new Error("Foto nicht gefunden");
    const ids = patch.strainIds !== undefined ? mockStrainIds(grow, patch.strainIds) : undefined;
    grow.photos = grow.photos.map((p) => ({
      ...p,
      ...(p.id === photoId && ids ? { strainIds: ids } : {}),
      ...(p.id === photoId && patch.caption !== undefined ? { caption: patch.caption.trim().slice(0, 200) } : {}),
      ...(patch.cover ? { cover: p.id === photoId } : {}),
    }));
    mockCover(grow);
    return { ...grow };
  },
  async deletePhoto(growId, photoId) {
    await delay(120);
    const grow = mockGrow(growId);
    const removed = grow.photos.find((p) => p.id === photoId);
    if (!removed) throw new Error("Foto nicht gefunden");
    grow.photos = grow.photos.filter((p) => p.id !== photoId);
    if (removed.cover && grow.photos[0]) grow.photos[0] = { ...grow.photos[0], cover: true };
    mockCover(grow);
    return { ...grow };
  },
  async addLog(growId, input) {
    await delay(150);
    const grow = mockGrow(growId);
    const date = mockDiaryDate(grow, input.date);
    const log: GrowLog = { id: `l-${Date.now()}`, day: dayDiff(grow.startDate, date), date, title: input.title.trim(), text: input.text.trim(), tag: input.tag, strainIds: mockStrainIds(grow, input.strainIds) };
    grow.logs = sortLogs([log, ...grow.logs]);
    return log;
  },
  async updateLog(growId, logId, patch) {
    await delay(120);
    const grow = mockGrow(growId);
    const old = grow.logs.find((l) => l.id === logId);
    if (!old) throw new Error("Eintrag nicht gefunden");
    const date = patch.date !== undefined ? mockDiaryDate(grow, patch.date) : old.date;
    const log: GrowLog = { ...old, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(patch.text !== undefined ? { text: patch.text.trim() } : {}), ...(patch.tag ? { tag: patch.tag } : {}), ...(patch.strainIds !== undefined ? { strainIds: mockStrainIds(grow, patch.strainIds) } : {}), date, day: dayDiff(grow.startDate, date) };
    grow.logs = sortLogs(grow.logs.map((l) => (l.id === logId ? log : l)));
    return log;
  },
  async deleteLog(growId, logId) {
    await delay(100);
    const grow = mockGrow(growId);
    grow.logs = grow.logs.filter((l) => l.id !== logId);
  },
  async saveEnv(growId, input) {
    await delay(120);
    const grow = mockGrow(growId);
    const date = mockDiaryDate(grow, input.date);
    const values = { temp: input.temp ?? null, rh: input.rh ?? null, ec: input.ec ?? null, ph: input.ph ?? null };
    const day = dayDiff(grow.startDate, date);
    const perStrain = (input.strainEnv ?? []).map((e) => ({ day, date, strainId: e.strainId, plant: e.plant ?? 0, ph: e.ph ?? null, ec: e.ec ?? null })).filter((e) => e.ph !== null || e.ec !== null);
    mockStrainIds(grow, (input.strainEnv ?? []).map((e) => e.strainId));
    const seenKeys = new Set<string>();
    for (const e of perStrain) {
      const key = `${e.strainId}#${e.plant}`;
      if (seenKeys.has(key)) throw new Error(e.plant === 0 ? "Eine Sorte ist doppelt angegeben" : "Eine Pflanze ist doppelt angegeben");
      seenKeys.add(key);
      const plants = grow.strains.find((x) => x.id === e.strainId)?.plants ?? null;
      if (e.plant > 0 && (!plants || e.plant > plants)) throw new Error(`Pflanze ${e.plant} gibt es bei dieser Sorte nicht`);
    }
    const wholeEmpty = Object.values(values).every((v) => v === null);
    if (wholeEmpty && perStrain.length === 0) throw new Error("Mindestens ein Wert ist nötig");
    const point = withVpd({ day, date, vpd: null, ...values }, grow.leafOffset);
    grow.env = wholeEmpty ? grow.env.filter((e) => e.date !== date) : [...grow.env.filter((e) => e.date !== date), point].sort((a, b) => a.date.localeCompare(b.date));
    if (input.strainEnv !== undefined) grow.strainEnv = [...(grow.strainEnv ?? []).filter((e) => e.date !== date), ...perStrain];
    return point;
  },
  async deleteEnv(growId, date) {
    await delay(100);
    const grow = mockGrow(growId);
    grow.env = grow.env.filter((e) => e.date !== date);
    grow.strainEnv = (grow.strainEnv ?? []).filter((e) => e.date !== date);
  },
};

/** Mock-Uploads: blob:-URLs, gültig bis zum Neuladen (kein Server). */
const mediaService: MediaService = {
  async upload(blob, options) {
    await delay(200);
    return { path: URL.createObjectURL(blob), kind: options ? "file" : "image", name: options?.name ?? "", size: blob.size, contentType: blob.type };
  },
  async config() {
    return { maxBytes: 4 * 1024 * 1024, hdAllowed: false };
  },
};

/** Demo: Overrides nur in diesem Browser (localStorage `go-features`). */
const FEATURE_STORAGE = "go-features";
const readOverrides = (): Record<string, boolean> => {
  try {
    const raw = JSON.parse(localStorage.getItem(FEATURE_STORAGE) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
};
const writeOverrides = (next: Record<string, boolean>) => {
  try {
    if (Object.keys(next).length) localStorage.setItem(FEATURE_STORAGE, JSON.stringify(next));
    else localStorage.removeItem(FEATURE_STORAGE);
  } catch { /* storage blocked */ }
  return next;
};
const featureService: FeatureService = {
  global: false,
  async get() { return readOverrides(); },
  async set(key, enabled) { return writeOverrides({ ...readOverrides(), [key]: enabled }); },
  async reset() { return writeOverrides({}); },
};

/** Demo-Releases (Session). Seed = aktuelle Version, damit „Was ist neu“ etwas zeigt. */
const releaseStore: Release[] = [{
  id: `rel-${APP_VERSION}`, version: APP_VERSION, title: "App-Updates & Neuigkeiten", severity: "recommended", features: [],
  notes: ["Die App erkennt neue Versionen selbst", "Update-Verhalten in den Einstellungen wählbar", "„Was ist neu“ nach jedem Update"],
  publishedAt: "2026-09-24T00:00:00.000Z",
}];
const releaseService: ReleaseService = {
  async list() { await delay(80); return [...releaseStore].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); },
  async create(input) {
    await delay(120);
    const r: Release = { ...input, id: `rel-${Date.now()}`, publishedAt: new Date().toISOString() };
    releaseStore.unshift(r);
    return r;
  },
  async remove(id) { await delay(80); const i = releaseStore.findIndex((r) => r.id === id); if (i >= 0) releaseStore.splice(i, 1); },
};

/** Kommentare zu Posts/Hall (Session). */
const itemCommentStore: Record<string, ItemComment[]> = {};
const commentService: CommentService = {
  async list(kind, id) {
    await delay(120);
    const community = kind === "post" ? findCommunityPost(id)?.communityId : undefined;
    const moderator = community ? isMockModerator(community) : false;
    return (itemCommentStore[`${kind}:${id}`] ?? []).filter((c) => moderator || !c.hidden).map((c) => ({ ...c }));
  },
  async add(kind, id, text) {
    await delay(120);
    const c: ItemComment = { id: `ic-${Date.now()}`, author: currentUser.name, avatar: currentUser.avatar, body: text, ago: "gerade eben", mine: true };
    (itemCommentStore[`${kind}:${id}`] ??= []).push(c);
    return c;
  },
};

/** Gesendete Chat-Nachrichten je Konversation (Session). */
const chatStore: Record<string, ChatMessage[]> = {};

const taskStore: Task[] = upcomingTasks.map((t) => ({ ...t, prio: t.prio as Task["prio"] }));

const taskService: TaskService = {
  async list() {
    await delay(160);
    return taskStore.map((t) => ({ ...t }));
  },
  async create(input) {
    await delay(160);
    const task: Task = { id: `tk-${Date.now()}`, done: false, ...input };
    taskStore.unshift(task);
    return { ...task };
  },
  async toggle(id) {
    await delay(80);
    const task = taskStore.find((t) => t.id === id);
    if (!task) throw new Error("Task nicht gefunden");
    task.done = !task.done;
    return { ...task };
  },
};

/** Katalog + selbst angelegte Sorten; Sammlung als ID-Set (wie im Backend). */
const strainStore: Strain[] = [...catalogStrains];
const collected = new Set(myStrainCollection.map((s) => s.id));

const strainService: StrainService = {
  async list() {
    await delay();
    return [...strainStore];
  },
  async catalog() {
    await delay();
    return [...strainStore];
  },
  async collection() {
    await delay(120);
    return strainStore.filter((s) => collected.has(s.id));
  },
  async toggleCollect(id) {
    await delay(80);
    if (!strainStore.some((s) => s.id === id)) throw new Error("Sorte nicht gefunden");
    if (collected.has(id)) collected.delete(id); else collected.add(id);
    return collected.has(id);
  },
  async create(input) {
    await delay();
    const palette = { Sativa: "info", Indica: "soil", Hybrid: "leaf" } as const;
    const strain: Strain = {
      ...input,
      id: `s-${Date.now()}`,
      rating: 0,
      reviews: 0,
      tag: "Eigene",
      color: palette[input.type],
    };
    strainStore.unshift(strain);
    collected.add(strain.id);
    return strain;
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
  async create(input) {
    await delay();
    const words = input.body.join(" ").split(/\s+/).filter(Boolean).length;
    const article = {
      ...input,
      id: `w-${Date.now()}`,
      readMin: Math.max(1, Math.round(words / 200)),
      author: currentUser.name,
      updated: "gerade eben",
      version: "0.1",
    };
    wikiArticles.unshift(article);
    const { body: _b, ...brief } = article;
    return brief;
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

/** Kommentare je Thread; Seed wird beim ersten Zugriff kopiert (Votes/Antworten pro Thread getrennt). */
function commentsFor(threadId: string): ForumComment[] {
  if (!(threadId in threadStore.comments)) {
    threadStore.comments[threadId] = seedThreads.some((t) => t.id === threadId) ? structuredClone(sampleComments) : [];
  }
  return threadStore.comments[threadId];
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
  async vote(threadId, delta) {
    await delay(100);
    const t = threadStore.threads.find((x) => x.id === threadId);
    if (!t) throw new Error("Thread nicht gefunden");
    t.votes += delta - (t.myVote ?? 0);
    t.myVote = delta;
    return { votes: t.votes, myVote: delta };
  },
  async voteComment(commentId, delta) {
    await delay(80);
    const find = (list: ForumComment[]): ForumComment | undefined => {
      for (const c of list) { if (c.id === commentId) return c; const hit = find(c.replies ?? []); if (hit) return hit; }
      return undefined;
    };
    let c: ForumComment | undefined;
    for (const t of threadStore.threads) {
      const list = commentsFor(t.id);
      c = find(list);
      if (c) { threadStore.comments[t.id] = list; break; }
    }
    if (!c) throw new Error("Kommentar nicht gefunden");
    c.votes += delta - (c.myVote ?? 0);
    c.myVote = delta;
    return { votes: c.votes, myVote: delta };
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
  async addComment(threadId, text, parentId) {
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
      replies: [],
    };
    const list = commentsFor(threadId);
    if (parentId) {
      const attach = (nodes: ForumComment[]): boolean => nodes.some((n) => (n.id === parentId ? ((n.replies = [...(n.replies ?? []), c]), true) : attach(n.replies ?? [])));
      if (!attach(list)) throw new Error("Antwortziel nicht gefunden");
      threadStore.comments[threadId] = list;
    } else {
      threadStore.comments[threadId] = [...list, c];
    }
    t.comments += 1;
    return { ...c };
  },
};

/** Mock-Chat (nur Demo): Direktnachrichten mit den Kontakten der Beispieldaten; gelesen/ungelesen bleibt für die Session erhalten. */
const mockPeople: ChatPerson[] = seedConversations.map((c) => ({ id: `p-${c.id}`, name: c.name, handle: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), avatar: c.avatar }));
const readConversations = new Set<string>();
const extraConversations: ConversationItem[] = [];

/**
 * Mock-Mitglieder (nur Demo): die Chat-Kontakte der Beispieldaten als Profile; die ersten drei zeigen die drei Sichtbarkeiten
 * (offen, nur Follower, privat). Folgen gilt nur für die Session. Keine erfundenen Statistiken: Zähler bleiben 0.
 */
const demoVisibility = (index: number): ProfileVisibility => (index % 3 === 1 ? "followers" : index % 3 === 2 ? "nobody" : "all");
const mockFollowing = new Map<string, FollowState>();
const demoMemberOf = (handle: string) => {
  const index = mockPeople.findIndex((p) => p.handle === handle.replace(/^@/, "").toLowerCase());
  return index < 0 ? null : { person: mockPeople[index]!, visibility: demoVisibility(index) };
};
const asMemberPerson = (p: ChatPerson): MemberPerson => ({ id: p.id, name: p.name, handle: p.handle, avatar: p.avatar, title: "Grower" });
const memberService: MemberService = {
  async get(handle) {
    await delay();
    const found = demoMemberOf(handle);
    if (!found) throw new Error("Mitglied nicht gefunden");
    const following = mockFollowing.get(found.person.handle) ?? "none";
    const full = found.visibility === "all" || (found.visibility === "followers" && following === "accepted");
    const base: MemberProfile = { ...asMemberPerson(found.person), isMe: false, restricted: !full, visibility: full ? undefined : found.visibility, relation: { following, followedBy: false }, canFollow: found.visibility !== "nobody" || following !== "none" };
    return full ? { ...base, bio: "Demo-Profil: Im Betrieb stehen hier die Angaben des Mitglieds.", location: "", growSince: null, medium: null, interests: [], stats: { grows: 0, harvests: 0, followers: following === "accepted" ? 1 : 0, following: 0 } } : base;
  },
  async follow(handle) {
    await delay();
    const found = demoMemberOf(handle);
    if (!found) throw new Error("Mitglied nicht gefunden");
    if (found.visibility === "nobody") throw new Error("Dieses Profil ist privat.");
    const status: FollowState = found.visibility === "all" ? "accepted" : "pending";
    mockFollowing.set(found.person.handle, status);
    return status;
  },
  async unfollow(handle) { await delay(); mockFollowing.delete(handle.replace(/^@/, "").toLowerCase()); },
  async followers() { await delay(); return []; },
  async following() { await delay(); return mockPeople.filter((p) => mockFollowing.get(p.handle) === "accepted").map(asMemberPerson); },
  async requests(): Promise<FollowRequest[]> { await delay(); return []; },
  async accept() { await delay(); },
  async decline() { await delay(); },
  async removeFollower() { await delay(); },
  async grows() { await delay(); return []; },
  async grow() { await delay(); throw new Error("Nicht gefunden"); },
  async activity() { await delay(); return []; },
};

const noGroups = async (): Promise<never> => { throw new Error("Gruppen brauchen den Server"); };

const chatService: ChatService = {
  async listConversations() {
    await delay();
    const seeded = seedConversations.map<ConversationItem>(({ messages: _m, ...rest }) => ({ ...rest, unread: readConversations.has(rest.id) ? 0 : rest.unread }));
    return [...extraConversations, ...seeded];
  },
  async getMessages(conversationId) {
    await delay();
    const c = seedConversations.find((x) => x.id === conversationId);
    return c ? [...c.messages, ...(chatStore[conversationId] ?? [])] : [...(chatStore[conversationId] ?? [])];
  },
  async sendMessage(conversationId, text, attachments, _topicId, replyTo) {
    await delay(140);
    const original = replyTo ? ([...(seedConversations.find((x) => x.id === conversationId)?.messages ?? []), ...(chatStore[conversationId] ?? [])] as ChatMessage[]).find((m) => m.id === replyTo) : undefined;
    const quote = original ? { id: original.id, from: original.from, senderName: original.from === "me" ? "Du" : seedConversations.find((x) => x.id === conversationId)?.name ?? "", text: original.deleted ? "" : original.text.slice(0, 140), hasAttachment: !original.deleted && !!(original.image || original.attachments?.length), deleted: !!original.deleted } : null;
    const msg: ChatMessage = { id: String(Date.now()), from: "me", text, image: attachments?.find((a) => a.kind === "image")?.path, attachments: attachments ?? [], time: "jetzt", replyTo: quote };
    (chatStore[conversationId] ??= []).push(msg);
    return msg;
  },
  async deleteMessage(conversationId, messageId) {
    await delay(100);
    const mine = chatStore[conversationId]?.find((m) => m.id === messageId);
    if (!mine) throw new Error("Nur eigene Nachrichten lassen sich löschen");
    Object.assign(mine, { text: "", image: undefined, attachments: [], deleted: true });
  },
  async startDirect(userId) {
    await delay();
    const person = mockPeople.find((p) => p.id === userId);
    if (!person) throw new Error("Person nicht gefunden");
    const existing = [...extraConversations, ...seedConversations].find((c) => c.name === person.name);
    if (existing) return { id: existing.id, name: existing.name, avatar: existing.avatar, online: existing.online, last: existing.last, time: existing.time, unread: 0 };
    const created: ConversationItem = { id: `cv-new-${userId}`, name: person.name, avatar: person.avatar, online: false, last: "", time: "", unread: 0 };
    extraConversations.unshift(created);
    return created;
  },
  async markRead(conversationId) { readConversations.add(conversationId); },
  async unreadTotal() { return seedConversations.reduce((sum, c) => sum + (readConversations.has(c.id) ? 0 : c.unread), 0); },
  async searchPeople(query) {
    await delay(80);
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : mockPeople.filter((p) => p.name.toLowerCase().includes(q) || p.handle.includes(q)).slice(0, 10);
  },
  // Gruppenchats (B-65) brauchen den Server (Einladungen, Rollen, Themen): die Oberfläche blendet sie in der Demo aus.
  createGroup: noGroups,
  getGroup: noGroups,
  updateGroup: noGroups,
  inviteToGroup: noGroups,
  revokeInvite: noGroups,
  async listInvites() { return []; },
  acceptInvite: noGroups,
  declineInvite: noGroups,
  removeMember: noGroups,
  leaveGroup: noGroups,
  createTopic: noGroups,
  updateTopic: noGroups,
  deleteTopic: noGroups,
  moveTopic: noGroups,
  setTopicMembers: noGroups,
  muteTopic: noGroups,
};

/** Gelesen-Status bleibt für die Session erhalten. */
const notificationStore = seedNotifications.map((n) => ({ ...n }));

const notificationService: NotificationService = {
  async list() {
    await delay();
    return notificationStore.map((n) => ({ ...n }));
  },
  async markRead(id) {
    await delay(80);
    const n = notificationStore.find((x) => x.id === id);
    if (n) n.read = true;
  },
  async markAllRead() {
    await delay(100);
    notificationStore.forEach((n) => { n.read = true; });
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

/* ---------- Communities (Mock, Session-persistent) ---------- */
const communityStore: CommunityDetail[] = [
  {
    id: "co-1", name: "Berlin Living Soil", description: "No-Till, Komposttee und regionale Treffen.",
    isPrivate: false, members: 284, joined: true, role: "member", createdAt: "2026-01-12",
    membersList: [
      { id: "u-me", name: currentUser.name, handle: currentUser.handle, avatar: currentUser.avatar, role: "member" },
      { id: "u-2", name: "Lena B.", handle: "@lena_grows", avatar: AVATARS[5], role: "admin" },
    ],
  },
  {
    id: "co-2", name: "Haze Collective", description: "Sativa-Genetiken, Phänotypen und Klima.",
    isPrivate: false, members: 143, joined: false, createdAt: "2026-02-01", membersList: [],
  },
  {
    id: "co-3", name: "Grow-Crew Privat", description: "Geschlossener Kreis für gemeinsame Runs.",
    isPrivate: true, members: 8, joined: true, role: "admin", createdAt: "2026-02-18",
    membersList: [
      { id: "u-me", name: currentUser.name, handle: currentUser.handle, avatar: currentUser.avatar, role: "admin" },
      { id: "u-3", name: "soilWizard", handle: "@soilwizard", avatar: AVATARS[3], role: "moderator" },
    ],
  },
];

const inviteStore = new Map<string, string>();
const isMockModerator = (communityId: string) => {
  const role = communityStore.find((c) => c.id === communityId)?.role;
  return role === "moderator" || role === "admin";
};
const banStore: Record<string, BannedMember[]> = {};
const reportStore: Record<string, ReportGroup[]> = {};
const countOpen = (communityId: string) => (reportStore[communityId] ?? []).filter((g) => g.status === "open").length;

const MOCK_PAGE = 20;
const pageOf = (groups: ReportGroup[], offset: number): ReportPage => ({
  items: groups.slice(offset, offset + MOCK_PAGE).map((g) => structuredClone(g)), hasMore: groups.length > offset + MOCK_PAGE,
});

const communityService: CommunityService = {
  async list() { await delay(); return communityStore.map(({ membersList: _m, ...c }) => ({ ...c })); },
  async get(id) {
    await delay(120);
    const c = communityStore.find((x) => x.id === id);
    if (!c) return undefined;
    const copy = structuredClone(c);
    if (isMockModerator(id)) copy.openReports = countOpen(id);
    return copy;
  },
  async create(input) {
    await delay();
    const c: CommunityDetail = {
      id: `co-${Date.now()}`, ...input, members: 1, joined: true, role: "admin",
      createdAt: new Date().toISOString(),
      membersList: [{ id: "u-me", name: currentUser.name, handle: currentUser.handle, avatar: currentUser.avatar, role: "admin" }],
    };
    communityStore.unshift(c);
    return structuredClone(c);
  },
  async joinPublic(id) {
    await delay(120); const c = communityStore.find((x) => x.id === id);
    if (!c || c.isPrivate) throw new Error("Community nicht öffentlich");
    if ((banStore[id] ?? []).some((b) => b.id === "u-me")) throw new Error("Du wurdest aus dieser Community gesperrt");
    if (!c.joined) { c.joined = true; c.role = "member"; c.members += 1; }
  },
  async createInvite(id) {
    await delay(100); const code = `go-inv_${Math.random().toString(36).slice(2, 10)}`;
    inviteStore.set(code, id);
    return { code, expiresAt: new Date(Date.now() + 86400000).toISOString() };
  },
  async joinByCode(code) {
    await delay(); const id = inviteStore.get(code) ?? (code === "demo-private" ? "co-3" : undefined);
    const c = communityStore.find((x) => x.id === id);
    if (!c) throw new Error("Einladung ungültig oder abgelaufen");
    if (!c.joined) { c.joined = true; c.role = "member"; c.members += 1; }
    return structuredClone(c);
  },
  async setMemberRole(communityId, userId, role) {
    await delay(100); const c = communityStore.find((x) => x.id === communityId);
    const m = c?.membersList.find((x) => x.id === userId); if (m && role) m.role = role;
  },
  async kick(communityId, userId, ban) {
    await delay(100);
    const c = communityStore.find((x) => x.id === communityId);
    const m = c?.membersList.find((x) => x.id === userId);
    if (!c || !m) throw new Error("Mitglied nicht gefunden");
    if (m.role === "admin") throw new Error("Admins können nicht entfernt werden – zuerst die Rolle ändern");
    if (c.role === "moderator" && m.role !== "member") throw new Error("Moderatoren können nur Mitglieder entfernen");
    c.membersList = c.membersList.filter((x) => x.id !== userId);
    c.members = Math.max(0, c.members - 1);
    if (ban) (banStore[communityId] ??= []).push({ id: m.id, name: m.name, handle: m.handle, avatar: m.avatar, bannedAt: new Date().toISOString() });
  },
  async bans(communityId) { await delay(80); return [...(banStore[communityId] ?? [])]; },
  async unban(communityId, userId) { await delay(80); banStore[communityId] = (banStore[communityId] ?? []).filter((b) => b.id !== userId); },
  async setHidden(communityId, kind, targetId, hidden) {
    await delay(80);
    if (kind === "post") {
      const p = communityPostStore[communityId]?.find((x) => x.id === targetId);
      if (p) p.hidden = hidden || undefined;
    } else {
      for (const list of Object.values(itemCommentStore)) { const c = list.find((x) => x.id === targetId); if (c) c.hidden = hidden || undefined; }
    }
  },
  async report(communityId, input) {
    await delay(100);
    const list = (reportStore[communityId] ??= []);
    const post = input.kind === "post" ? communityPostStore[communityId]?.find((x) => x.id === input.targetId) : undefined;
    const comment = input.kind === "comment" ? Object.values(itemCommentStore).flat().find((x) => x.id === input.targetId) : undefined;
    const group = list.find((g) => g.kind === input.kind && g.targetId === input.targetId && g.status === "open");
    const entry = { id: `rp-${Date.now()}`, reporter: currentUser.name, reason: input.reason, details: input.details ?? "", ago: "gerade eben" };
    if (group) {
      if (group.reports.some((r) => r.reporter === currentUser.name)) return { duplicate: true };
      group.reports.push(entry); group.count += 1;
      return { duplicate: false };
    }
    const preview = post ? { text: post.text, image: post.image ?? null, author: post.author, handle: post.handle, hidden: !!post.hidden }
      : comment ? { text: comment.body, image: null, author: comment.author, handle: "", hidden: !!comment.hidden } : null;
    list.push({ kind: input.kind, targetId: input.targetId, status: "open", count: 1, preview, reports: [entry] });
    return { duplicate: false };
  },
  async reports(communityId, status, offset = 0) {
    await delay(80);
    return pageOf((reportStore[communityId] ?? []).filter((g) => (status === "open" ? g.status === "open" : g.status !== "open")), offset);
  },
  async resolveReport(communityId, kind, targetId, action) {
    await delay(80);
    const group = (reportStore[communityId] ?? []).find((g) => g.kind === kind && g.targetId === targetId && g.status === "open");
    if (!group) throw new Error("Keine offene Meldung");
    if (action === "hide") await communityService.setHidden(communityId, kind, targetId, true);
    group.status = action === "hide" ? "hidden" : "dismissed";
    group.resolvedBy = currentUser.name; group.resolvedAgo = "gerade eben";
  },
  async leave(communityId) {
    await delay(100);
    const c = communityStore.find((x) => x.id === communityId);
    if (!c || !c.joined) throw new Error("Du bist kein Mitglied dieser Community");
    if (c.role === "admin" && c.membersList.filter((m) => m.role === "admin" && m.id !== "u-me").length === 0) {
      throw new Error(c.members > 1 ? "Du bist der einzige Admin. Ernenne zuerst ein anderes Mitglied zum Admin." : "Du bist das letzte Mitglied – die Community kann so nicht verlassen werden.");
    }
    c.joined = false; c.role = undefined; c.members = Math.max(0, c.members - 1);
    c.membersList = c.membersList.filter((m) => m.id !== "u-me");
  },
};

/* ---------- Plattform-Moderation (Mock, lokal simuliert) ---------- */
const globalReportStore: ReportGroup[] = [];
const platformModerationService: PlatformModerationService = {
  async report(input) {
    await delay(100);
    const entry = { id: `rp-${Date.now()}`, reporter: currentUser.name, reason: input.reason, details: input.details ?? "", ago: "gerade eben" };
    const group = globalReportStore.find((g) => g.kind === input.kind && g.targetId === input.targetId && g.status === "open");
    if (group) {
      if (group.reports.some((r) => r.reporter === currentUser.name)) return { duplicate: true };
      group.reports.push(entry); group.count += 1;
      return { duplicate: false };
    }
    globalReportStore.push({ kind: input.kind, targetId: input.targetId, status: "open", count: 1, preview: null, reports: [entry] });
    return { duplicate: false };
  },
  async queue(status, offset = 0) {
    await delay(80);
    return pageOf(globalReportStore.filter((g) => (status === "open" ? g.status === "open" : g.status !== "open")), offset);
  },
  async resolve(kind, targetId, action) {
    await delay(80);
    const group = globalReportStore.find((g) => g.kind === kind && g.targetId === targetId && g.status === "open");
    if (!group) throw new Error("Keine offene Meldung");
    group.status = action === "hide" ? "hidden" : "dismissed";
    group.resolvedBy = currentUser.name; group.resolvedAgo = "gerade eben";
  },
  async setHidden() { await delay(60); },
};

/* ---------- Dev-Admin (Mock, lokal simuliert) ---------- */
const adminUsers: AdminUser[] = [
  { id: "u-me", name: currentUser.name, handle: currentUser.handle, email: "admin@growobserver.app", role: "platform_admin", level: 20, grows: seedGrows.length, status: "aktiv" },
  { id: "u-2", name: "Lena B.", handle: "@lena_grows", email: "lena@example.com", role: "member", level: 8, grows: 2, status: "aktiv" },
  { id: "u-3", name: "soilWizard", handle: "@soilwizard", email: "soil@example.com", role: "moderator", level: 12, grows: 4, status: "aktiv" },
  { id: "u-4", name: "NebulaGrow", handle: "@nebula", email: "nebula@example.com", role: "member", level: 5, grows: 1, status: "gesperrt" },
];

const adminThreads: AdminContentItem[] = seedThreads.map((t) => ({
  id: t.id, type: "thread" as const, title: t.title, createdAt: new Date().toISOString(),
}));
const adminPosts: AdminContentItem[] = seedPosts.map((p) => ({
  id: p.id, type: "post" as const, text: p.text, createdAt: new Date().toISOString(),
}));

const mockLog: ModerationLogEntry[] = [];
const adminService: AdminService = {
  async health() {
    await delay(200);
    return {
      ok: false,
      mode: "mock",
      latencyMs: 0,
      version: "0.1.0-mock",
      services: {
        api: { ok: false, status: "unknown", hint: "Demo-Modus: kein Server geprüft" },
        db: { ok: false, status: "unknown", hint: "Nur im API-Modus prüfbar", latencyMs: null },
        storage: { ok: false, status: "unknown", hint: "Kein Storage geprüft" },
        ai: { ok: false, status: "unknown", hint: "Kein Provider angebunden" },
      },
    };
  },
  async stats() {
    await delay(220);
    return {
      users: adminUsers.length,
      grows: seedGrows.length,
      activeGrows: seedGrows.filter((g) => g.phase !== "Ernte").length,
      posts: seedPosts.length,
      threads: seedThreads.length,
      comments: sampleComments.length,
      strains: myStrainCollection.length,
      products: seedProducts.length,
      wikiArticles: wikiArticles.length,
      hallEntries: seedHall.length,
      notifications: seedNotifications.length,
    };
  },
  async users(q) {
    await delay(180);
    const needle = (q ?? "").toLowerCase();
    return adminUsers
      .filter((u) => !needle || `${u.name} ${u.handle} ${u.email}`.toLowerCase().includes(needle))
      .map((u) => ({ ...u }));
  },
  async verifyEmail(userId) {
    await delay(140);
    const i = adminUsers.findIndex((u) => u.id === userId);
    if (i >= 0) adminUsers[i] = { ...adminUsers[i], emailVerified: true };
  },
  async setRole(userId, role) {
    await delay(140);
    const i = adminUsers.findIndex((u) => u.id === userId);
    if (i >= 0) adminUsers[i] = { ...adminUsers[i], role };
  },
  async content() {
    await delay(180);
    return [...adminThreads, ...adminPosts];
  },
  async deleteThread(id) {
    await delay(140);
    const i = adminThreads.findIndex((t) => t.id === id);
    if (i >= 0) adminThreads.splice(i, 1);
  },
  async deletePost(id) {
    await delay(140);
    const i = adminPosts.findIndex((p) => p.id === id);
    if (i >= 0) adminPosts.splice(i, 1);
  },
  async ban(userId, reason) {
    await delay(140);
    const i = adminUsers.findIndex((u) => u.id === userId);
    if (i < 0 || adminUsers[i]!.role === "platform_admin") throw new Error("Betreiber-Konten können nicht gesperrt oder gelöscht werden");
    adminUsers[i] = { ...adminUsers[i]!, status: "gesperrt", banReason: reason ?? null };
    mockLog.unshift({ id: `log-${Date.now()}`, action: "ban", actor: currentUser.name, target: adminUsers[i]!.name, targetKind: null, reason: reason ?? null, details: null, createdAt: new Date().toISOString() });
  },
  async unban(userId) {
    await delay(140);
    const i = adminUsers.findIndex((u) => u.id === userId);
    if (i >= 0) { adminUsers[i] = { ...adminUsers[i]!, status: "aktiv", banReason: null }; mockLog.unshift({ id: `log-${Date.now()}`, action: "unban", actor: currentUser.name, target: adminUsers[i]!.name, targetKind: null, reason: null, details: null, createdAt: new Date().toISOString() }); }
  },
  async deleteUser(userId) {
    await delay(200);
    const i = adminUsers.findIndex((u) => u.id === userId);
    if (i < 0 || adminUsers[i]!.role === "platform_admin") throw new Error("Betreiber-Konten können nicht gesperrt oder gelöscht werden");
    mockLog.unshift({ id: `log-${Date.now()}`, action: "delete_account", actor: currentUser.name, target: adminUsers[i]!.name, targetKind: null, reason: null, details: null, createdAt: new Date().toISOString() });
    adminUsers.splice(i, 1);
  },
  async moderationLog(offset = 0) {
    await delay(100);
    return { items: mockLog.slice(offset, offset + 30), hasMore: mockLog.length > offset + 30 };
  },
};

export const mockServices: Services = {
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
