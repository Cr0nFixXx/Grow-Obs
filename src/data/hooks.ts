import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "./DataContext";
import { useResource } from "./useResource";

/**
 * Invalidierung über Hook-Instanzen hinweg (z. B. Glocke, Drawer-Badge und Benachrichtigungsseite
 * laden getrennt). `invalidate("notifications")` lässt alle Instanzen neu laden.
 */
type DataKey = "notifications" | "grows";
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
  const { data, loading, error, refresh } = useAsync(() => svc.forum.getThread(id), [svc, id]);
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
  return { community: data, loading, error, refresh, createInvite, setRole };
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

export function useChat() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.chat.listConversations(), [svc]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectedInitially = useRef(false);
  const { data: messages, loading: msgLoading, refresh: reloadMessages } = useAsync(
    () => (activeId ? svc.chat.getMessages(activeId) : Promise.resolve([])),
    [svc, activeId]
  );
  const send = useCallback(
    async (text: string, image?: string) => {
      if (!activeId) return;
      await svc.chat.sendMessage(activeId, text, image);
      await reloadMessages();
    },
    [svc, activeId, reloadMessages]
  );
  useEffect(() => {
    if (!selectedInitially.current && data?.length) {
      selectedInitially.current = true;
      setActiveId(data[0].id);
    }
  }, [data]);
  return {
    conversations: data ?? [],
    loading,
    error,
    refresh,
    activeId,
    setActiveId,
    messages: messages ?? [],
    msgLoading,
    reloadMessages,
    send,
  };
}

export function useNotifications() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.notifications.list(), [svc]);
  useInvalidation("notifications", refresh);
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
