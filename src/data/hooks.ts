import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "./DataContext";
import { useResource } from "./useResource";
import { useRealtime, useRealtimeEvent, useRealtimeTopic } from "@/lib/realtime-context";
import { resolveTopic } from "@/lib/chat-groups";
import type { ChatAttachment, CreateGroupInput, TopicInput, TopicPatch } from "@/services/interfaces";
import type { ReportAction, ReportGroup, ReportKind, ReportPage } from "@/types";

/**
 * Invalidierung über Hook-Instanzen hinweg (z. B. Glocke, Drawer-Badge und Benachrichtigungsseite
 * laden getrennt). `invalidate("notifications")` lässt alle Instanzen neu laden.
 */
type DataKey = "notifications" | "grows" | "chat";
const EVENT = "go:data-changed";
export function invalidate(key: DataKey) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}
function useInvalidation(key: DataKey, refresh: () => unknown) {
  useEffect(() => {
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === key) void refresh(); };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [key, refresh]);
}

/** Generic async-data hook (loading/error/refresh) – Grundgerüst für alle Listen. */
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  // Existing hook callers supply stable service/id dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- generischer Hook, deps kommen vom Aufrufer
  const load = useCallback(fn, deps);
  return useResource(load);
}

export function useGrows() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.grows.list(), [svc]);
  useInvalidation("grows", refresh);
  return { grows: data ?? [], loading, error, refresh };
}

export function useStrains() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.strains.list(), [svc]);
  return { strains: data ?? [], loading, error, refresh };
}

export function useStrainCatalog() {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => svc.strains.catalog(), [svc]);
  return { strains: data ?? [], loading, error };
}

export function useStrainCollection() {
  const svc = useServices();
  const { data, loading, refresh } = useAsync(() => svc.strains.collection().catch(() => []), [svc]);
  const ids = useMemo(() => new Set((data ?? []).map((s) => s.id)), [data]);
  const toggle = useCallback(async (id: string) => {
    const collected = await svc.strains.toggleCollect(id);
    await refresh();
    return collected;
  }, [svc, refresh]);
  return { collection: data ?? [], ids, loading, toggle };
}

export function useTasks() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.tasks.list(), [svc]);
  return { tasks: data ?? [], loading, error, refresh };
}

export function useSocialPosts() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.social.listPosts(), [svc]);

  const createPost = useCallback(
    async (text: string, image?: string, tags?: string[]) => {
      const post = await svc.social.createPost({ text, image, tags });
      refresh();
      return post;
    },
    [svc, refresh]
  );

  const toggleLike = useCallback(
    async (postId: string) => {
      await svc.social.toggleLike(postId);
      refresh();
    },
    [svc, refresh]
  );

  return { posts: data ?? [], loading, error, refresh, createPost, toggleLike };
}

export function useSubs() {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => svc.forum.subs(), [svc]);
  return { subs: data ?? [], loading, error };
}

export function useForumThreads() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.forum.listThreads(), [svc]);
  const createThread = useCallback(
    async (input: { title: string; sub: string; text: string }) => {
      const t = await svc.forum.createThread(input);
      refresh();
      return t;
    },
    [svc, refresh]
  );
  return { threads: data ?? [], loading, error, refresh, createThread };
}

export function useThread(id: string) {
  const svc = useServices();
  const { data, loading, error, refresh, silentRefresh } = useAsync(() => svc.forum.getThread(id), [svc, id]);
  // Echtzeit (B-59): neue Kommentare erscheinen live; bei Wiederverbindung/Polling wird neu geladen.
  useRealtimeTopic(`thread:${id}`);
  useRealtimeEvent(["thread.comment", "resync", "poll"], (event) => {
    if (event.type !== "thread.comment" || event.threadId === id) void silentRefresh();
  });
  const vote = useCallback(
    async (delta: 1 | -1 | 0) => {
      const result = await svc.forum.vote(id, delta);
      refresh();
      return result;
    },
    [svc, id, refresh]
  );
  const addComment = useCallback(
    async (text: string, parentId?: string) => {
      await svc.forum.addComment(id, text, parentId);
      refresh();
    },
    [svc, id, refresh]
  );
  return { thread: data, loading, error, refresh, vote, addComment };
}

export function useProducts() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.products.list(), [svc]);
  return { products: data ?? [], loading, error, refresh };
}

export function useProductCategories() {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => svc.products.categories(), [svc]);
  return { categories: data ?? [], loading, error };
}

export function useSeedOffers(enabled = true) {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => (enabled ? svc.products.offers() : Promise.resolve([])), [svc, enabled]);
  return { offers: data ?? [], loading, error };
}

export function useBreeders() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.breeders.list(), [svc]);
  return { breeders: data ?? [], loading, error, refresh };
}

export function useHall() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.hall.list(), [svc]);
  return { entries: data ?? [], loading, error, refresh };
}

export function useActivity() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.activity.list(), [svc]);
  return { activity: data ?? [], loading, error, refresh };
}

export function useCommunities() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.communities.list(), [svc]);
  const create = useCallback(async (input: { name: string; description: string; isPrivate: boolean }) => {
    const c = await svc.communities.create(input); await refresh(); return c;
  }, [svc, refresh]);
  const joinPublic = useCallback(async (id: string) => { await svc.communities.joinPublic(id); await refresh(); }, [svc, refresh]);
  const joinByCode = useCallback(async (code: string) => { const c = await svc.communities.joinByCode(code); await refresh(); return c; }, [svc, refresh]);
  return { communities: data ?? [], loading, error, refresh, create, joinPublic, joinByCode };
}

export function useCommunity(id: string) {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.communities.get(id), [svc, id]);
  const createInvite = useCallback(() => svc.communities.createInvite(id), [svc, id]);
  const setRole = useCallback(async (userId: string, role: "member" | "moderator" | "admin") => {
    await svc.communities.setMemberRole(id, userId, role); await refresh();
  }, [svc, id, refresh]);
  const kick = useCallback(async (userId: string, ban: boolean) => {
    await svc.communities.kick(id, userId, ban); await refresh();
  }, [svc, id, refresh]);
  const leave = useCallback(async () => { await svc.communities.leave(id); }, [svc, id]);
  return { community: data, loading, error, refresh, createInvite, setRole, kick, leave };
}

/** Feed einer Community (B-61): Beiträge, schreiben, liken, aus-/einblenden. */
export function useCommunityFeed(id: string) {
  const svc = useServices();
  const { data, loading, error, refresh, silentRefresh } = useAsync(() => svc.social.listPosts(id), [svc, id]);
  // Echtzeit (B-89): neue/ausgeblendete Beiträge und Kommentare erscheinen live; bei Wiederverbindung/Polling wird neu geladen.
  useRealtimeTopic(`community:${id}`);
  useRealtimeEvent(["community.feed", "resync", "poll"], (event) => {
    if (event.type !== "community.feed" || event.communityId === id) void silentRefresh();
  });
  const createPost = useCallback(async (text: string) => {
    const post = await svc.social.createPost({ text, communityId: id }); await refresh(); return post;
  }, [svc, id, refresh]);
  const toggleLike = useCallback(async (postId: string) => { await svc.social.toggleLike(postId); await refresh(); }, [svc, refresh]);
  const setHidden = useCallback(async (postId: string, hidden: boolean) => {
    await svc.communities.setHidden(id, "post", postId, hidden); await refresh();
  }, [svc, id, refresh]);
  return { posts: data ?? [], loading, error, refresh, createPost, toggleLike, setHidden };
}

/** Sperrliste einer Community (nur Admins). */
export function useCommunityBans(id: string, enabled: boolean) {
  const svc = useServices();
  const banList = useAsync(() => (enabled ? svc.communities.bans(id) : Promise.resolve([])), [svc, id, enabled]);
  const unban = useCallback(async (userId: string) => { await svc.communities.unban(id, userId); await banList.refresh(); }, [svc, id, banList]);
  return { bans: banList.data ?? [], unban };
}

/**
 * Warteschlange der Moderation (offen/entschieden), seitenweise (B-89): `loadMore` hängt die nächste Seite an.
 * `load` und `act` kapseln Community bzw. Plattform; `scope` ändert sich nur, wenn die Quelle wechselt.
 */
export function useReportQueue(scope: string, status: "open" | "closed", load: (status: "open" | "closed", offset: number) => Promise<ReportPage>, act: (kind: ReportKind, targetId: string, action: ReportAction) => Promise<void>) {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++run.current;
    setLoading(true);
    try {
      const page = await loadRef.current(status, 0);
      if (mine !== run.current) return;
      setGroups(page.items); setHasMore(page.hasMore); setError(null);
    } catch (e) {
      if (mine === run.current) setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally { if (mine === run.current) setLoading(false); }
  }, [status]);
  useEffect(() => { setGroups([]); void refresh(); }, [refresh, scope]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await loadRef.current(status, groups.length);
      setGroups((prev) => [...prev, ...page.items.filter((g) => !prev.some((p) => p.kind === g.kind && p.targetId === g.targetId && p.status === g.status))]);
      setHasMore(page.hasMore);
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler beim Laden"); }
    finally { setLoadingMore(false); }
  }, [status, groups.length]);

  const resolve = useCallback(async (kind: ReportKind, targetId: string, action: ReportAction) => {
    await act(kind, targetId, action); await refresh();
  }, [act, refresh]);
  return { groups, hasMore, loading, loadingMore, error, refresh, loadMore, resolve };
}

export function useWikiCategories() {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => svc.wiki.categories(), [svc]);
  return { categories: data ?? [], loading, error };
}

export function useWikiArticles() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.wiki.list(), [svc]);
  return { articles: data ?? [], loading, error, refresh };
}

/** „schreibt …“ gilt so lange, ohne neues Signal. */
const TYPING_TTL_MS = 5000;
/** Eigenes „schreibt …“ höchstens so oft melden. */
const TYPING_SEND_INTERVAL_MS = 3000;

export type GroupActions = ReturnType<typeof useChat>["groupActions"];

export function useChat() {
  const svc = useServices();
  const realtime = useRealtime();
  const conv = useAsync(() => svc.chat.listConversations(), [svc]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  /** Gewähltes Thema je Gruppe (ohne Wahl: „Allgemein“). */
  const [topicChoice, setTopicChoice] = useState<Record<string, string>>({});
  const selectedInitially = useRef(false);
  const chosenTopic = activeId ? topicChoice[activeId] : undefined;
  const msgs = useAsync(
    () => (activeId ? (chosenTopic ? svc.chat.getMessages(activeId, chosenTopic) : svc.chat.getMessages(activeId)) : Promise.resolve([])),
    [svc, activeId, chosenTopic]
  );
  const isGroup = !!conv.data?.find((c) => c.id === activeId)?.isGroup;
  const groupQuery = useAsync(
    () => (activeId && isGroup ? svc.chat.getGroup(activeId).catch(() => null) : Promise.resolve(null)),
    [svc, activeId, isGroup]
  );
  const invitesQuery = useAsync(() => svc.chat.listInvites().catch(() => []), [svc]);
  const { silentRefresh: refreshList } = conv;
  const { silentRefresh: refreshMessages } = msgs;
  const { silentRefresh: refreshGroup } = groupQuery;
  const { silentRefresh: refreshInvites } = invitesQuery;
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typingIds, setTypingIds] = useState<Set<string>>(new Set());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const group = activeId && groupQuery.data?.id === activeId ? groupQuery.data : null;
  const activeTopic = group ? resolveTopic(group.topics, chosenTopic) : null;
  const activeTopicRef = useRef<string | null>(null);
  activeTopicRef.current = activeTopic?.id ?? null;

  const markRead = useCallback(async (id: string, topicId?: string) => {
    try { await (topicId ? svc.chat.markRead(id, topicId) : svc.chat.markRead(id)); } catch { return; }
    invalidate("chat");
    void refreshList();
    if (topicId) void refreshGroup();
  }, [svc, refreshList, refreshGroup]);

  const clearTyping = (key: string) => {
    const timer = typingTimers.current.get(key);
    if (!timer) return;
    clearTimeout(timer);
    typingTimers.current.delete(key);
    setTypingIds((s) => { const n = new Set(s); n.delete(key); return n; });
  };
  const bumpTyping = (key: string) => {
    setTypingIds((s) => new Set(s).add(key));
    clearTimeout(typingTimers.current.get(key));
    typingTimers.current.set(key, setTimeout(() => {
      typingTimers.current.delete(key);
      setTypingIds((s) => { const n = new Set(s); n.delete(key); return n; });
    }, TYPING_TTL_MS));
  };

  useRealtimeEvent(["chat.message", "chat.read", "chat.typing", "chat.group", "presence", "resync", "poll"], (event) => {
    switch (event.type) {
      case "chat.message": {
        const id = String(event.conversationId);
        const topic = event.topicId ? String(event.topicId) : undefined;
        void refreshList();
        if (id === activeRef.current) {
          void refreshGroup(); // Zähler der Themen
          const open = activeTopicRef.current;
          if (!topic || !open || topic === open) {
            void refreshMessages();
            if (document.visibilityState === "visible") void markRead(id, open ?? undefined);
          }
        }
        // Die Nachricht beendet „schreibt …“.
        clearTyping(id);
        if (topic) clearTyping(`${id}:${topic}`);
        break;
      }
      case "chat.typing": {
        const id = String(event.conversationId);
        bumpTyping(id);
        if (event.topicId) bumpTyping(`${id}:${String(event.topicId)}`);
        break;
      }
      case "chat.group":
        void refreshList();
        void refreshInvites();
        if (String(event.conversationId) === activeRef.current) { void refreshGroup(); void refreshMessages(); }
        invalidate("chat");
        break;
      case "presence":
        setPresence((p) => ({ ...p, [String(event.userId)]: event.online === true }));
        break;
      default: // chat.read, resync, poll
        void refreshList();
        if (activeRef.current) { void refreshMessages(); void refreshGroup(); }
        if (event.type !== "chat.read") void refreshInvites();
        // Stand nach Wiederverbindung: veraltete Online-Hinweise verwerfen, die Liste liefert den aktuellen Stand.
        if (event.type !== "chat.read") setPresence({});
    }
  });
  useEffect(() => { const timers = typingTimers.current; return () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); }; }, []);

  const send = useCallback(
    async (text: string, attachments?: ChatAttachment[]) => {
      if (!activeId) return;
      const topicId = activeTopicRef.current;
      await (topicId ? svc.chat.sendMessage(activeId, text, attachments, topicId) : svc.chat.sendMessage(activeId, text, attachments));
      await Promise.all([refreshMessages(), refreshList(), refreshGroup()]);
    },
    [svc, activeId, refreshMessages, refreshList, refreshGroup]
  );
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!activeId) return;
      await svc.chat.deleteMessage(activeId, messageId);
      await Promise.all([refreshMessages(), refreshList()]);
    },
    [svc, activeId, refreshMessages, refreshList]
  );
  const conversations = useMemo(
    () => (conv.data ?? []).map((c) => (c.partnerId && c.partnerId in presence ? { ...c, online: presence[c.partnerId] } : c)),
    [conv.data, presence]
  );
  const active = conversations.find((c) => c.id === activeId);
  const activeUnread = active?.unread ?? 0;
  const topicUnread = activeTopic?.unread ?? 0;

  useEffect(() => {
    if (!selectedInitially.current && conv.data?.length) {
      selectedInitially.current = true;
      setActiveIdState(conv.data[0].id);
    }
  }, [conv.data]);
  // Gruppe verlassen/entfernt: die Auswahl verschwindet mit ihr.
  const knownGroups = useRef(new Set<string>());
  useEffect(() => {
    if (!conv.data) return;
    if (activeId && knownGroups.current.has(activeId) && !conv.data.some((c) => c.id === activeId)) setActiveIdState(null);
    for (const c of conv.data) if (c.isGroup) knownGroups.current.add(c.id);
  }, [activeId, conv.data]);
  // Geöffnete Konversation (Gruppe: geöffnetes Thema) mit ungelesenen Nachrichten = gelesen (nur im sichtbaren Tab).
  useEffect(() => {
    if (!activeId || document.visibilityState !== "visible") return;
    if (isGroup) { if (activeTopic && topicUnread > 0) void markRead(activeId, activeTopic.id); }
    else if (activeUnread > 0) void markRead(activeId);
  }, [activeId, isGroup, activeTopic, topicUnread, activeUnread, markRead]);

  /** Eigene Eingabe melden (gedrosselt). */
  const notifyTyping = useCallback(() => {
    const id = activeRef.current;
    if (!id || Date.now() - lastTypingSent.current < TYPING_SEND_INTERVAL_MS) return;
    lastTypingSent.current = Date.now();
    const topicId = activeTopicRef.current;
    if (topicId) realtime.typing(id, topicId); else realtime.typing(id);
  }, [realtime]);
  const openDirect = useCallback(async (userId: string) => {
    const item = await svc.chat.startDirect(userId);
    await refreshList();
    setActiveIdState(item.id);
    return item;
  }, [svc, refreshList]);

  const selectTopic = useCallback((topicId: string) => {
    const id = activeRef.current;
    if (id) setTopicChoice((c) => ({ ...c, [id]: topicId }));
  }, []);

  /** Gruppenaktionen (B-65): führen aus und laden Liste, Gruppe, Einladungen und Verlauf neu. */
  const gid = () => { const id = activeRef.current; if (!id) throw new Error("Keine Gruppe geöffnet"); return id; };
  const act = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const result = await fn();
    await Promise.all([refreshList(), refreshGroup(), refreshInvites(), refreshMessages()]);
    invalidate("chat");
    return result;
  };
  const groupActions = {
    async create(input: CreateGroupInput) {
      const created = await svc.chat.createGroup(input);
      await Promise.all([refreshList(), refreshInvites()]);
      setActiveIdState(created.id);
      invalidate("chat");
      return created;
    },
    update: (patch: { name?: string; avatar?: string | null; historyVisible?: boolean }) => act(() => svc.chat.updateGroup(gid(), patch)),
    invite: (userIds: string[]) => act(() => svc.chat.inviteToGroup(gid(), userIds)),
    revokeInvite: (inviteId: string) => act(() => svc.chat.revokeInvite(gid(), inviteId)),
    removeMember: (userId: string) => act(() => svc.chat.removeMember(gid(), userId)),
    async leave() {
      await svc.chat.leaveGroup(gid());
      setActiveIdState(null);
      await Promise.all([refreshList(), refreshInvites()]);
      invalidate("chat");
    },
    createTopic: (input: TopicInput) => act(() => svc.chat.createTopic(gid(), input)),
    updateTopic: (topicId: string, patch: TopicPatch) => act(() => svc.chat.updateTopic(gid(), topicId, patch)),
    deleteTopic: (topicId: string) => act(() => svc.chat.deleteTopic(gid(), topicId)),
    moveTopic: (topicId: string, direction: "up" | "down") => act(() => svc.chat.moveTopic(gid(), topicId, direction)),
    setTopicMembers: (topicId: string, userIds: string[]) => act(() => svc.chat.setTopicMembers(gid(), topicId, userIds)),
    muteTopic: (topicId: string, muted: boolean) => act(() => svc.chat.muteTopic(gid(), topicId, muted)),
    async accept(inviteId: string) {
      const { conversationId } = await svc.chat.acceptInvite(inviteId);
      await Promise.all([refreshList(), refreshInvites()]);
      setActiveIdState(conversationId);
      invalidate("chat");
    },
    async decline(inviteId: string) {
      await svc.chat.declineInvite(inviteId);
      await refreshInvites();
    },
  };

  return {
    conversations,
    loading: conv.loading,
    error: conv.error,
    refresh: conv.refresh,
    activeId,
    setActiveId: setActiveIdState,
    messages: msgs.data ?? [],
    msgLoading: msgs.loading,
    reloadMessages: msgs.refresh,
    send,
    deleteMessage,
    typing: activeId ? typingIds.has(activeTopic ? `${activeId}:${activeTopic.id}` : activeId) : false,
    typingIds,
    notifyTyping,
    openDirect,
    live: realtime.status,
    group,
    activeTopic,
    selectTopic,
    invites: invitesQuery.data ?? [],
    groupActions,
  };
}

/** Ungelesene Chat-Nachrichten insgesamt (Navigation). `enabled=false` → keine Anfrage. */
export function useChatUnread(enabled = true): number {
  return useChatUnreadState(enabled).count;
}

/** Wie `useChatUnread`, zusätzlich mit `loaded` (false, bis der erste Stand da ist – für „neu seit“-Vergleiche). */
export function useChatUnreadState(enabled = true): { count: number; loaded: boolean } {
  const svc = useServices();
  const { data, silentRefresh } = useAsync(() => (enabled ? svc.chat.unreadTotal().catch(() => 0) : Promise.resolve(0)), [svc, enabled]);
  useInvalidation("chat", silentRefresh);
  return { count: data ?? 0, loaded: data !== undefined };
}

/** Übersetzt Echtzeit-Ereignisse in Datenaktualisierungen (einmal in der App-Hülle einbinden). */
export function useRealtimeBridge(): void {
  useRealtimeEvent(["notification", "chat.message", "chat.read", "chat.group", "resync", "poll"], (event) => {
    if (event.type === "notification" || event.type === "resync" || event.type === "poll") invalidate("notifications");
    if (event.type !== "notification") invalidate("chat");
  });
}

export function useNotifications() {
  const svc = useServices();
  const { data, loading, error, refresh, silentRefresh } = useAsync(() => svc.notifications.list(), [svc]);
  useInvalidation("notifications", silentRefresh);
  const markRead = useCallback(
    async (id: string) => {
      await svc.notifications.markRead(id);
      invalidate("notifications");
    },
    [svc]
  );
  const markAllRead = useCallback(async () => {
    await svc.notifications.markAllRead();
    invalidate("notifications");
  }, [svc]);
  return { items: data ?? [], loading, error, refresh, markRead, markAllRead };
}
