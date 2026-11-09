import { useCallback, useRef } from "react";

interface Options {
  /** Dauer bis zum langen Druck (ms). */
  ms?: number;
  /** Bewegung (px), ab der es als Scrollen/Wischen gilt und der lange Druck abbricht. */
  tolerance?: number;
}

/**
 * Langer Druck für Touch und Maus (B-94). Bewegt sich der Finger (Scrollen), loslässt oder verlässt er das Element, gibt es keinen langen Druck.
 * Nach einem ausgelösten langen Druck liefert `consumeClick()` einmal `true`, damit der folgende Klick nicht doppelt wirkt.
 */
export function useLongPress(onLongPress: () => void, { ms = 450, tolerance = 10 }: Options = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; fired.current = true; callback.current(); }, ms);
  }, [ms]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > tolerance) cancel();
  }, [cancel, tolerance]);

  const consumeClick = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Mobil öffnet ein langer Druck sonst das Browser-Kontextmenü.
      onContextMenu: (e: React.MouseEvent) => { if (fired.current || timer.current) e.preventDefault(); },
    },
    consumeClick,
  };
}
