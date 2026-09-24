import { useCallback, useEffect, useState } from "react";
import { useServices } from "./DataContext";

/** Generic async-data hook (loading/error/refresh) – Grundgerüst für alle Listen. */
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => {
    setLoading(true);
    return fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { data, loading, error, refresh: run };
}

export function useGrows() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.grows.list(), [svc]);
  return { grows: data ?? [], loading, error, refresh };
}

export function useStrains() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.strains.list(), [svc]);
  return { strains: data ?? [], loading, error, refresh };
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
    async (delta: 1 | -1) => {
      await svc.forum.vote(id, delta);
      refresh();
    },
    [svc, id, refresh]
  );
  const addComment = useCallback(
    async (text: string) => {
      await svc.forum.addComment(id, text);
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

export function useWikiArticles() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.wiki.list(), [svc]);
  return { articles: data ?? [], loading, error, refresh };
}

export function useChat() {
  const svc = useServices();
  const { data, loading, error, refresh } = useAsync(() => svc.chat.listConversations(), [svc]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: messages, loading: msgLoading, refresh: reloadMessages } = useAsync(
    () => (activeId ? svc.chat.getMessages(activeId) : Promise.resolve([])),
    [svc, activeId]
  );
  const send = useCallback(
    async (text: string) => {
      if (!activeId) return;
      await svc.chat.sendMessage(activeId, text);
      await reloadMessages();
    },
    [svc, activeId, reloadMessages]
  );
  useEffect(() => {
    if (!activeId && data && data.length) setActiveId(data[0].id);
  }, [data, activeId]);
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
  const markRead = useCallback(
    async (id: string) => {
      await svc.notifications.markRead(id);
      refresh();
    },
    [svc, refresh]
  );
  const markAllRead = useCallback(async () => {
    await svc.notifications.markAllRead();
    refresh();
  }, [svc, refresh]);
  return { items: data ?? [], loading, error, refresh, markRead, markAllRead };
}
