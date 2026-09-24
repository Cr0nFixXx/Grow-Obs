import { useEffect, useRef, useState, type RefObject } from "react";

/** Media-query hook with SSR-safe initial value. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** True when the user prefers reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Locks body scroll while a modal/drawer is open. */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

/** Tracks vertical scroll progress (0..1) of a scroll container / window. */
export function useScrollProgress(deps: unknown[] = []): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const node = document.documentElement;
      const max = node.scrollHeight - node.clientHeight;
      setProgress(max > 0 ? Math.min(1, node.scrollTop / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return progress;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Traps keyboard focus within a container while active; restores previous focus on close. */
export function useFocusTrap(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const previously = document.activeElement as HTMLElement | null;
    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    getFocusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      previously?.focus?.();
    };
  }, [active, ref]);
}

/**
 * Drives a custom auto-hide scrollbar: tracks window scroll position/geometry
 * and reports a `visible` flag (true while scrolling, fades shortly after).
 */
export function useAutoHideScroll() {
  const [visible, setVisible] = useState(false);
  const [thumb, setThumb] = useState({ top: 0, height: 0 });

  useEffect(() => {
    let hideTimer = 0;
    const update = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const height = max > 0 ? Math.max(34, (el.clientHeight / el.scrollHeight) * el.clientHeight) : 0;
      const top = max > 0 ? (el.scrollTop / max) * (el.clientHeight - height) : 0;
      setThumb({ top, height });
    };
    const onScroll = () => {
      update();
      setVisible(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setVisible(false), 850);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      window.clearTimeout(hideTimer);
    };
  }, []);

  return { visible, thumb };
}

/** Pull-to-Refresh: tracks touch pull at scroll-top, reports distance + refreshing flag. */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, threshold = 70) {
  const [state, setState] = useState({ distance: 0, refreshing: false });
  const ref = useRef({ startY: 0, pulling: false, distance: 0, refreshing: false });

  useEffect(() => {
    const r = ref.current;

    /** PTR nur auf „freier“ Seite: kein Overlay offen, kein Formular-Fokus. */
    const allowed = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable) return false;
      // Overlays setzen Body-Scroll-Lock (overflow: hidden) → kein PTR.
      if (document.body.style.overflow === "hidden") return false;
      return true;
    };

    const onStart = (e: TouchEvent) => {
      if (!allowed(e.target)) return;
      if (window.scrollY <= 0 && !r.refreshing) {
        r.startY = e.touches[0].clientY;
        r.pulling = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!r.pulling || r.refreshing) return;
      const delta = e.touches[0].clientY - r.startY;
      if (delta > 0 && window.scrollY <= 0) {
        r.distance = Math.min(threshold + 30, delta * 0.5);
        setState((s) => ({ ...s, distance: r.distance }));
      }
    };
    const onEnd = () => {
      if (!r.pulling) return;
      r.pulling = false;
      if (r.distance >= threshold && !r.refreshing) {
        r.refreshing = true;
        r.distance = threshold;
        setState({ distance: threshold, refreshing: true });
        Promise.resolve(onRefresh()).finally(() => {
          window.setTimeout(() => {
            r.refreshing = false;
            r.distance = 0;
            setState({ distance: 0, refreshing: false });
          }, 600);
        });
      } else {
        r.distance = 0;
        setState((s) => ({ ...s, distance: 0 }));
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onRefresh, threshold]);

  return state;
}

/** Returns false for `delay` ms after mount, then true (drives short skeleton flashes). */
export function useDelayedReady(delay = 300) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  return ready;
}

/**
 * Erkennt „vom linken Displayrand nach rechts wischen" (iOS-Back-Geste), um das
 * Menü zu öffnen. Arbeitet als **passiver** window-Listener — kein Overlay-DOM,
 * dadurch werden Klicks und horizontales Scrollen (Tabs, Ticker) nicht blockiert.
 * Die Geste muss horizontal dominant sein, damit vertikales Scrollen nicht triggert.
 */
export function useEdgeSwipeToOpen(onOpen: () => void, edgeWidth = 28) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      tracking = t.clientX <= edgeWidth;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Horizontal dominant und deutlich gezogen.
      if (dx > 46 && dy < 24) {
        tracking = false;
        onOpen();
      }
    };

    const onEnd = () => {
      tracking = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onOpen, edgeWidth]);
}

/**
 * Long-press detection; `wasLongPress()` lets the click handler skip navigation.
 * Bricht bei Bewegung (>10 px), Verlassen oder Multi-Touch ab — sonst würde das
 * Kontextmenü bereits beim Scrollen auslösen.
 */
export function useLongPress(cb: () => void, ms = 480) {
  const timer = useRef(0);
  const fired = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const cancel = () => window.clearTimeout(timer.current);

  const start = (e: React.PointerEvent) => {
    // Nur Primärkontakt (Daumen), kein Stift-rechts-Klick.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    cancel();
    timer.current = window.setTimeout(() => {
      fired.current = true;
      cb();
    }, ms);
  };

  const move = (e: React.PointerEvent) => {
    if (fired.current) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > 10 || dy > 10) cancel();
  };

  return {
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
    wasLongPress: () => fired.current,
  };
}
