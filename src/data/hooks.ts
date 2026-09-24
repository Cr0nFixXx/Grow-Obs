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
