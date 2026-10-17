import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "./DataContext";
import { useResource } from "./useResource";
import { useRealtime, useRealtimeEvent, useRealtimeTopic } from "@/lib/realtime-context";

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

export function useSeedOffers() {
  const svc = useServices();
  const { data, loading, error } = useAsync(() => svc.products.offers(), [svc]);
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
  return { community: data, loading, error, refresh, createInvite, setRole, kick };
}

/** Feed einer Community (B-61): Beiträge, schreiben, liken, aus-/einblenden. */
export function useCommunityFeed(id: string) {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.social.listPosts(id), [svc, id]);
  const createPost = useCallback(async (text: string) => {
    const post = await svc.social.createPost({ text, communityId: id }); await refresh(); return post;
  }, [svc, id, refresh]);
  const toggleLike = useCallback(async (postId: string) => { await svc.social.toggleLike(postId); await refresh(); }, [svc, refresh]);
  const setHidden = useCallback(async (postId: string, hidden: boolean) => {
    await svc.communities.setHidden(id, "post", postId, hidden); await refresh();
  }, [svc, id, refresh]);
  return { posts: data ?? [], loading, error, refresh, createPost, toggleLike, setHidden };
}

/** Warteschlange der Moderation (offen/entschieden) und Sperrliste (nur Admins). */
export function useModeration(id: string, status: "open" | "closed", withBans: boolean) {
  const svc = useServices();
  const queue = useAsync(() => svc.communities.reports(id, status), [svc, id, status]);
  const banList = useAsync(() => (withBans ? svc.communities.bans(id) : Promise.resolve([])), [svc, id, withBans]);
  const resolve = useCallback(async (kind: "post" | "comment", targetId: string, action: "hide" | "dismiss") => {
    await svc.communities.resolveReport(id, kind, targetId, action); await queue.refresh();
  }, [svc, id, queue]);
  const unban = useCallback(async (userId: string) => { await svc.communities.unban(id, userId); await banList.refresh(); }, [svc, id, banList]);
  return {
    groups: queue.data ?? [], loading: queue.loading, error: queue.error, refresh: queue.refresh, resolve,
    bans: banList.data ?? [], unban,
  };
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

export function useChat() {
  const svc = useServices();
  const realtime = useRealtime();
  const conv = useAsync(() => svc.chat.listConversations(), [svc]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectedInitially = useRef(false);
  const msgs = useAsync(
    () => (activeId ? svc.chat.getMessages(activeId) : Promise.resolve([])),
    [svc, activeId]
  );
  const { silentRefresh: refreshList } = conv;
  const { silentRefresh: refreshMessages } = msgs;
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typingIds, setTypingIds] = useState<Set<string>>(new Set());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const markRead = useCallback(async (id: string) => {
    try { await svc.chat.markRead(id); } catch { return; }
    invalidate("chat");
    void refreshList();
  }, [svc, refreshList]);

  useRealtimeEvent(["chat.message", "chat.read", "chat.typing", "presence", "resync", "poll"], (event) => {
    switch (event.type) {
      case "chat.message": {
        void refreshList();
        if (event.conversationId === activeRef.current) {
          void refreshMessages();
          if (document.visibilityState === "visible") void markRead(activeRef.current!);
        }
        // Die Nachricht beendet „schreibt …“.
        const id = String(event.conversationId);
        const timer = typingTimers.current.get(id);
        if (timer) { clearTimeout(timer); typingTimers.current.delete(id); setTypingIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
        break;
      }
      case "chat.typing": {
        const id = String(event.conversationId);
        setTypingIds((s) => new Set(s).add(id));
        clearTimeout(typingTimers.current.get(id));
        typingTimers.current.set(id, setTimeout(() => {
          typingTimers.current.delete(id);
          setTypingIds((s) => { const n = new Set(s); n.delete(id); return n; });
        }, TYPING_TTL_MS));
        break;
      }
      case "presence":
        setPresence((p) => ({ ...p, [String(event.userId)]: event.online === true }));
        break;
      default: // chat.read, resync, poll
        void refreshList();
        if (activeRef.current) void refreshMessages();
        // Stand nach Wiederverbindung: veraltete Online-Hinweise verwerfen, die Liste liefert den aktuellen Stand.
        if (event.type !== "chat.read") setPresence({});
    }
  });
  useEffect(() => { const timers = typingTimers.current; return () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); }; }, []);

  const send = useCallback(
    async (text: string, image?: string) => {
      if (!activeId) return;
      await svc.chat.sendMessage(activeId, text, image);
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

  useEffect(() => {
    if (!selectedInitially.current && conv.data?.length) {
      selectedInitially.current = true;
      setActiveId(conv.data[0].id);
    }
  }, [conv.data]);
  // Geöffnete Konversation mit ungelesenen Nachrichten = gelesen (nur im sichtbaren Tab).
  useEffect(() => {
    if (activeId && activeUnread > 0 && document.visibilityState === "visible") void markRead(activeId);
  }, [activeId, activeUnread, markRead]);

  /** Eigene Eingabe melden (gedrosselt). */
  const notifyTyping = useCallback(() => {
    const id = activeRef.current;
    if (!id || Date.now() - lastTypingSent.current < TYPING_SEND_INTERVAL_MS) return;
    lastTypingSent.current = Date.now();
    realtime.typing(id);
  }, [realtime]);
  const openDirect = useCallback(async (userId: string) => {
    const item = await svc.chat.startDirect(userId);
    await refreshList();
    setActiveId(item.id);
    return item;
  }, [svc, refreshList]);

  return {
    conversations,
    loading: conv.loading,
    error: conv.error,
    refresh: conv.refresh,
    activeId,
    setActiveId,
    messages: msgs.data ?? [],
    msgLoading: msgs.loading,
    reloadMessages: msgs.refresh,
    send,
    typing: activeId ? typingIds.has(activeId) : false,
    typingIds,
    notifyTyping,
    openDirect,
    live: realtime.status,
  };
}

/** Ungelesene Chat-Nachrichten insgesamt (Navigation). `enabled=false` → keine Anfrage. */
export function useChatUnread(enabled = true): number {
  const svc = useServices();
  const { data, silentRefresh } = useAsync(() => (enabled ? svc.chat.unreadTotal().catch(() => 0) : Promise.resolve(0)), [svc, enabled]);
  useInvalidation("chat", silentRefresh);
  return data ?? 0;
}

/** Übersetzt Echtzeit-Ereignisse in Datenaktualisierungen (einmal in der App-Hülle einbinden). */
export function useRealtimeBridge(): void {
  useRealtimeEvent(["notification", "chat.message", "chat.read", "resync", "poll"], (event) => {
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
