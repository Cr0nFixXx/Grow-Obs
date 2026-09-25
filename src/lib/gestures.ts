import { useEffect, useRef, type RefObject } from "react";
import { animate, type MotionValue } from "framer-motion";

/**
 * Touch-Gesten für Overlays (Drawer, Sheets, Modals) und Tab-Wischen.
 *
 * Warum eigene Touch-Listener statt Framer `drag`?
 * Framer `drag` setzt `touch-action: none` → der Inhalt wäre nicht mehr nativ scrollbar. Deshalb
 * startete der Drag bisher nur am Griff/Rand. Hier: nicht-passive `touchmove`-Listener, die die
 * Geste NUR übernehmen, wenn (a) die Achse passt, (b) in Schließ-Richtung gezogen wird und
 * (c) ein scrollbarer Inhalt bereits am Anschlag steht. Sonst scrollt der Browser normal.
 */

export type SwipeAxis = "x" | "y";

/** Elemente, in denen nie eine Wisch-Geste startet (Formulare, Slider, Opt-out). */
export const NO_SWIPE_SELECTOR =
  "input,textarea,select,[contenteditable='true'],[role='slider'],[data-no-swipe]";

/** Richtungs-Lock nach Toleranz (px). `null` = noch nicht entschieden. */
export function lockAxis(dx: number, dy: number, slop = 8): SwipeAxis | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Soll eine beendete Geste schließen? `offset`/`velocity` sind bereits so normiert,
 * dass positiv = Schließ-Richtung. Velocity in px/ms.
 */
export function shouldDismiss(offset: number, velocity: number, threshold: number, velocityThreshold = 0.55): boolean {
  return offset > threshold || (velocity > velocityThreshold && offset > 16);
}

/** Tab-Wischen: deutlich horizontal, schnell genug, lang genug. */
export function isTabSwipe(dx: number, dy: number, dtMs: number, minDistance = 72): "next" | "prev" | null {
  if (Math.abs(dx) < minDistance) return null;
  if (Math.abs(dy) > Math.abs(dx) * 0.5) return null;
  if (dtMs > 700) return null;
  return dx < 0 ? "next" : "prev";
}

/** Kann `el` in Finger-Richtung noch selbst scrollen? fingerSign > 0 = Finger in +Achse. */
export function canScrollToward(el: HTMLElement, axis: SwipeAxis, fingerSign: number): boolean {
  const pos = axis === "y" ? el.scrollTop : el.scrollLeft;
  const max = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
  // Finger in +Richtung → Inhalt scrollt Richtung Anfang.
  return fingerSign > 0 ? pos > 0.5 : pos < max - 0.5;
}

/** Erstes scrollbares Element zwischen `from` und `root` (inklusive) auf der Achse. */
export function findScroller(from: Element | null, root: Element, axis: SwipeAxis): HTMLElement | null {
  let el: Element | null = from;
  while (el && el instanceof HTMLElement) {
    const style = window.getComputedStyle(el);
    const overflow = axis === "y" ? style.overflowY : style.overflowX;
    const scrollable = axis === "y" ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
    if (scrollable && (overflow === "auto" || overflow === "scroll")) return el;
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

interface SwipeDismissOptions {
  ref: RefObject<HTMLElement | null>;
  /** Motion-Value, der die Panel-Position steuert (gleicher Wert wie `style={{ x|y }}`). */
  value: MotionValue<number>;
  axis: SwipeAxis;
  /** +1 = Schließen in +Achse (Sheet nach unten, Drawer rechts), -1 = in -Achse (Drawer links). */
  direction: 1 | -1;
  enabled: boolean;
  onDismiss: () => void;
  threshold?: number;
}

/** Folgt dem Finger überall im Panel und schließt bei ausreichend Weg/Tempo. */
export function useSwipeToDismiss({ ref, value, axis, direction, enabled, onDismiss, threshold = 88 }: SwipeDismissOptions) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let startX = 0, startY = 0, lastOffset = 0, lastT = 0, velocity = 0;
    let locked: SwipeAxis | null = null;
    let active = false;
    let ignore = false;
    let scroller: HTMLElement | null = null;

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      ignore = e.touches.length !== 1 || !!target?.closest(NO_SWIPE_SELECTOR);
      if (ignore) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      locked = null; active = false; lastOffset = 0; velocity = 0; lastT = e.timeStamp;
      scroller = findScroller(target, root, axis);
    };

    const onMove = (e: TouchEvent) => {
      if (ignore) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!locked) {
        locked = lockAxis(dx, dy);
        if (!locked) return;
        if (locked !== axis) { ignore = true; return; }
        const raw0 = (axis === "x" ? dx : dy) * direction;
        // Nur in Schließ-Richtung übernehmen – und nur, wenn der Inhalt dort am Anschlag ist.
        if (raw0 <= 0 || (scroller && canScrollToward(scroller, axis, Math.sign(axis === "x" ? dx : dy)))) {
          ignore = true;
          return;
        }
        active = true;
      }
      if (!active) return;
      if (e.cancelable) e.preventDefault();
      const raw = (axis === "x" ? dx : dy) * direction;
      const offset = raw > 0 ? raw : raw * 0.15;
      value.set(offset * direction);
      const dt = Math.max(1, e.timeStamp - lastT);
      velocity = (offset - lastOffset) / dt;
      lastOffset = offset;
      lastT = e.timeStamp;
    };

    const onEnd = () => {
      if (active) {
        if (shouldDismiss(lastOffset, velocity, threshold)) dismissRef.current();
        else animate(value, 0, { type: "spring", stiffness: 420, damping: 38 });
      }
      active = false; ignore = false; locked = null;
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, value, axis, direction, enabled, threshold]);
}

/** Höhe der unteren Wischzone (Bottom-Nav-Tabs): 30 % des Viewports, mind. 180 px. */
export function bottomZoneHeight(viewportHeight: number): number {
  return Math.max(180, Math.round(viewportHeight * 0.3));
}

/**
 * Seitengesten (B-48):
 *  - untere Zone, links/rechts  → nächster/vorheriger Bottom-Nav-Tab
 *  - mittlere Zone, nach rechts → zurück (wie iOS/Android-Back)
 *  - mittlere Zone, nach links  → nichts (kein versehentliches Vorwärts)
 */
export function pageSwipeAction(startY: number, viewportHeight: number, dx: number, dy: number, dtMs: number): "back" | "next" | "prev" | null {
  const dir = isTabSwipe(dx, dy, dtMs);
  if (!dir) return null;
  const inBottomZone = startY >= viewportHeight - bottomZoneHeight(viewportHeight);
  if (inBottomZone) return dir;
  return dir === "prev" ? "back" : null;
}

/**
 * Globale Seitengesten. Konfliktfrei zum Drawer & Overlays:
 *  - Touches in `edgeGuard` px vom linken/rechten Rand werden ignoriert
 *    (links = Edge-Swipe-Menü (16 px) bzw. iOS-System-Back, rechts = Android-Back).
 *  - Ignoriert, solange ein Dialog (`[aria-modal="true"]`) offen ist.
 *  - Ignoriert in horizontal scrollbaren Bereichen, Formularen, Slidern, `[data-no-tab-swipe]` und in
 *    Bereichen mit eigenen Tabs (`[data-swipe-tabs]`, siehe `useSwipeTabs`).
 */
export function usePageSwipe(
  handlers: { onBack?: () => void; onTab?: (dir: "next" | "prev") => void },
  enabled: boolean,
  edgeGuard = 32,
) {
  const cb = useRef(handlers);
  useEffect(() => { cb.current = handlers; }, [handlers]);

  useEffect(() => {
    if (!enabled) return;
    let startX = 0, startY = 0, startT = 0, tracking = false;
    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = e.target as Element | null;
      if (t.clientX < edgeGuard || t.clientX > window.innerWidth - edgeGuard) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (!target || target.closest(`${NO_SWIPE_SELECTOR},[data-no-tab-swipe],[data-swipe-tabs]`)) return;
      if (findScroller(target, document.body, "x")) return;
      startX = t.clientX; startY = t.clientY; startT = e.timeStamp; tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const action = pageSwipeAction(startY, window.innerHeight, t.clientX - startX, t.clientY - startY, e.timeStamp - startT);
      if (action === "back") cb.current.onBack?.();
      else if (action) cb.current.onTab?.(action);
    };
    const onCancel = () => { tracking = false; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, edgeGuard]);
}

/**
 * Tab-Wischen innerhalb eines Bereichs (z. B. Developer-Admin, Profil). Der Container bekommt
 * `data-swipe-tabs`, damit die globale Seitengeste dort nicht greift.
 */
export function useSwipeTabs<T extends string>(ref: RefObject<HTMLElement | null>, tabs: readonly T[], value: T, onChange: (next: T) => void) {
  const state = useRef({ tabs, value, onChange });
  useEffect(() => { state.current = { tabs, value, onChange }; }, [tabs, value, onChange]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-swipe-tabs", "");
    let startX = 0, startY = 0, startT = 0, tracking = false;
    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target || target.closest(`${NO_SWIPE_SELECTOR},[data-no-tab-swipe]`)) return;
      if (findScroller(target, el, "x")) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; startT = e.timeStamp; tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dir = isTabSwipe(t.clientX - startX, t.clientY - startY, e.timeStamp - startT);
      if (!dir) return;
      const { tabs: list, value: current, onChange: change } = state.current;
      const next = list[list.indexOf(current) + (dir === "next" ? 1 : -1)];
      if (next) change(next);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeAttribute("data-swipe-tabs");
    };
  }, [ref]);
}
