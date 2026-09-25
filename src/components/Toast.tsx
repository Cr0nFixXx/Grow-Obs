import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { toneSoft, type Tone } from "@/lib/tokens";

interface Toast {
  id: number;
  title: string;
  desc?: string;
  tone?: Tone;
  icon?: string;
}

interface ToastCtx {
  push: (t: Omit<Toast, "id">) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

/** Minimal, accessible toast system rendered in a portal. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { ...t, id }]);
    window.setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((s) => s.filter((x) => x.id !== id)), []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div role="status" aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-20 right-4 z-[130] flex w-[min(92vw,360px)] flex-col gap-2 sm:bottom-4">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80 }}
                // Wischen auf der gesamten Toast-Fläche (links/rechts oder nach unten) schließt ihn.
                drag
                dragDirectionLock
                dragSnapToOrigin
                dragMomentum={false}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={{ left: 0.9, right: 0.9, top: 0.05, bottom: 0.6 }}
                onDragEnd={(_, info) => {
                  const away = Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 500 || info.offset.y > 48 || info.velocity.y > 500;
                  if (away) dismiss(t.id);
                }}
                className="card glass pointer-events-auto flex cursor-grab touch-none select-none items-start gap-3 p-3.5 elev-2 active:cursor-grabbing"
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneSoft[t.tone ?? "leaf"])}>
                  <Icon name={t.icon ?? "Sparkles"} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.desc && <div className="text-xs text-fg-muted">{t.desc}</div>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="text-fg-subtle transition-colors hover:text-fg"
                  aria-label="Schließen"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
