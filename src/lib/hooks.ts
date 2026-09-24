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

let bodyLockCount = 0;
let bodyScrollY = 0;
let bodyStyleSnapshot: Partial<Record<"overflow" | "position" | "top" | "width" | "paddingRight", string>> = {};

/**
 * Ref-counted, iOS-safe body scroll lock. Multiple stacked overlays no longer
 * unlock each other; the exact page position is restored after the final close.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    if (bodyLockCount === 0) {
      bodyScrollY = window.scrollY;
      bodyStyleSnapshot = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
      };
      const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${bodyScrollY}px`;
      body.style.width = "100%";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
      body.dataset.scrollLock = "true";
    }
    bodyLockCount += 1;
    return () => {
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount > 0) return;
      body.style.overflow = bodyStyleSnapshot.overflow ?? "";
      body.style.position = bodyStyleSnapshot.position ?? "";
      body.style.top = bodyStyleSnapshot.top ?? "";
      body.style.width = bodyStyleSnapshot.width ?? "";
      body.style.paddingRight = bodyStyleSnapshot.paddingRight ?? "";
      delete body.dataset.scrollLock;
      window.scrollTo(0, bodyScrollY);
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
  const ref = useRef({ startX: 0, startY: 0, pulling: false, distance: 0, refreshing: false, armed: false });

  useEffect(() => {
    const r = ref.current;

    /** PTR nur auf „freier“ Seite: kein Overlay offen, kein Formular-Fokus. */
    const allowed = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable) return false;
      // Overlays setzen Body-Scroll-Lock (overflow: hidden) → kein PTR.
      if (document.body.dataset.scrollLock === "true") return false;
      return true;
    };

    const onStart = (e: TouchEvent) => {
      if (!allowed(e.target)) return;
      if (window.scrollY <= 0 && !r.refreshing) {
        r.startX = e.touches[0].clientX;
        r.startY = e.touches[0].clientY;
        r.pulling = true;
        r.distance = 0;
        r.armed = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!r.pulling || r.refreshing) return;
      const dx = Math.abs(e.touches[0].clientX - r.startX);
      const delta = e.touches[0].clientY - r.startY;
      // Horizontal intent belongs to carousels/tabs, not pull-to-refresh.
      if (dx > Math.abs(delta) && dx > 12) {
        r.pulling = false;
        r.distance = 0;
        setState((s) => ({ ...s, distance: 0 }));
        return;
      }
      if (delta > 0 && window.scrollY <= 0) {
        r.distance = Math.min(threshold + 30, delta * 0.5);
        if (r.distance >= threshold && !r.armed) {
          r.armed = true;
          try { navigator.vibrate?.(12); } catch { /* optional haptic */ }
        } else if (r.distance < threshold - 8) {
          r.armed = false;
        }
        setState((s) => ({ ...s, distance: r.distance }));
      } else if (delta < 0) {
        r.pulling = false;
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
            r.armed = false;
            setState({ distance: 0, refreshing: false });
          }, 600);
        });
      } else {
        r.distance = 0;
        r.armed = false;
        setState((s) => ({ ...s, distance: 0 }));
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
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
export function useEdgeSwipeToOpen(onOpen: () => void, enabled = true, edgeWidth = 16) {
  useEffect(() => {
    if (!enabled) return;
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
  }, [onOpen, enabled, edgeWidth]);
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
