import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Search, Star, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useBodyScrollLock, useFocusTrap, useMediaQuery } from "@/lib/hooks";
import { Icon } from "@/components/Icon";
import { toneSoft, type Tone } from "@/lib/tokens";

/* ============================== Button ============================== */
type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "soil" | "danger" | "soft";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const btnBase =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none whitespace-nowrap";
const btnSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "h-10 w-10",
};
const btnVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-[0_10px_30px_-12px_var(--accent)]",
  secondary: "bg-surface-2 text-fg border border-border hover:bg-surface-3",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  outline: "border border-border-strong text-fg hover:bg-surface-2",
  soil: "bg-soil-500 text-white hover:brightness-110",
  danger: "bg-danger text-white hover:brightness-110",
  soft: "bg-accent/12 text-accent hover:bg-accent/20",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  loading,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(btnBase, btnSizes[size], btnVariants[variant], className)}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </motion.button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      aria-label={label}
      className={cn(
        "grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none",
        className
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
}

/* ============================== Card ============================== */
export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn("card elev-1", interactive && "card-hover cursor-pointer", className)}
      {...props}
    />
  );
}

/* ============================== Badge / Chip ============================== */
export function Badge({
  tone = "leaf",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneSoft[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent/12 text-accent"
          : "border-border bg-surface-2 text-fg-muted hover:text-fg hover:bg-surface-3",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ============================== Avatar ============================== */
export function Avatar({
  src,
  alt,
  size = 40,
  status,
  ring,
  className,
}: {
  src?: string;
  alt?: string;
  size?: number;
  status?: "online" | "offline";
  ring?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <img
        src={src}
        alt={alt ?? "Avatar"}
        loading="lazy"
        width={size}
        height={size}
        className={cn(
          "size-full rounded-full object-cover bg-surface-3",
          ring && "ring-2 ring-accent/50 ring-offset-2 ring-offset-bg"
        )}
      />
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 size-3 rounded-full border-2 border-bg",
            status === "online" ? "bg-leaf-500" : "bg-fg-subtle"
          )}
        />
      )}
    </span>
  );
}

/* ============================== Form controls ============================== */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      {label && <span className="text-sm font-medium text-fg">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-surface-2 px-4 text-sm text-fg placeholder:text-fg-subtle outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25",
          className
        )}
        {...props}
      />
    );
  }
);

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-border bg-surface-2 px-4 pr-10 text-sm text-fg outline-none transition focus:border-accent",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        className="h-11 w-full rounded-xl border border-border bg-surface-2 pl-10 pr-4 text-sm text-fg placeholder:text-fg-subtle outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        {...props}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-3")}
    >
      <span className={cn("inline-block size-5 transform rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-fg"
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-md border transition-colors",
          checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface-2"
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Slider({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="range"
      className={cn("h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3", className)}
      style={{ accentColor: "var(--accent)" }}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const lid = useId();
  return (
    <div className={cn("inline-flex max-w-full overflow-x-auto no-scrollbar rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "text-accent-fg" : "text-fg-muted hover:text-fg"
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${lid}`}
              className="absolute inset-0 rounded-lg bg-accent"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {o.icon && <Icon name={o.icon} size={14} />}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ============================== Progress / Meter / Stat ============================== */
export function ProgressBar({
  value,
  max = 100,
  color = "var(--accent)",
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

export function Meter({
  label,
  value,
  max,
  color = "var(--accent)",
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="tnum font-medium text-fg">
          {value}
          {suffix}
        </span>
      </div>
      <ProgressBar value={value} max={max} color={color} />
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  trend,
  icon,
  tone = "leaf",
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: "up" | "down";
  icon: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between">
        <div className={cn("grid size-10 place-items-center rounded-xl", toneSoft[tone])}>
          <Icon name={icon} size={18} />
        </div>
        {delta && (
          <span className={cn("text-xs font-medium", trend === "down" ? "text-danger" : "text-leaf-500 dark:text-leaf-400")}>
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tnum tracking-tight">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
    </Card>
  );
}

/* ============================== Rating stars ============================== */
export function RatingStars({
  value,
  size = 16,
  onChange,
  className,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
  className?: string;
}) {
  const pct = (value / 5) * 100;
  return (
    <div className={cn("relative inline-flex", className)} style={{ width: size * 5 + 8 }} title={`${value} / 5`}>
      <div className="flex gap-0.5 text-fg-subtle">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} className="fill-current" strokeWidth={0} />
        ))}
      </div>
      <div className="absolute inset-0 flex gap-0.5 overflow-hidden text-leaf-500 dark:text-leaf-400" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(i + 1)}
            className={cn(onChange && "cursor-pointer")}
            aria-label={`${i + 1} Sterne`}
          >
            <Star size={size} className="fill-current" strokeWidth={0} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================== Skeleton ============================== */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card p-5", className)}>
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="mt-4 h-6 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/2" />
    </div>
  );
}

/** Image with shimmer skeleton placeholder until loaded (premium loading state). */
export function SmartImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <span className={cn("relative block overflow-hidden bg-surface-2", className)}>
      {status === "loading" && <span className="absolute inset-0 shimmer" aria-hidden />}
      {status === "error" && (
        <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-leaf-600/25 to-soil-600/20 text-fg-subtle">
          <Icon name="Image" size={22} className="opacity-50" />
        </span>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn("relative h-full w-full object-cover transition-opacity duration-500", status === "loaded" ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}

/* ============================== Tabs ============================== */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "underline",
  className,
}: {
  tabs: { value: T; label: string; icon?: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  variant?: "underline" | "pill";
  className?: string;
}) {
  const lid = useId();
  if (variant === "pill")
    return (
      <div className={cn("inline-flex rounded-xl bg-surface-2 p-1", className)}>
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn("relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", value === t.value ? "text-accent-fg" : "text-fg-muted hover:text-fg")}
          >
            {value === t.value && <motion.span layoutId={`tab-${lid}`} className="absolute inset-0 rounded-lg bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative z-10 flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-black/10 px-1.5 text-[10px]">{t.count}</span>}
            </span>
          </button>
        ))}
      </div>
    );
  return (
    <div className={cn("flex gap-1 overflow-x-auto no-scrollbar border-b border-border", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn("relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors", value === t.value ? "text-fg" : "text-fg-muted hover:text-fg")}
        >
          <span className="flex items-center gap-1.5">
            {t.label}
            {t.count !== undefined && <span className="text-fg-subtle">{t.count}</span>}
          </span>
          {value === t.value && <motion.span layoutId={`tab-${lid}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/* ============================== Accordion ============================== */
export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {items.map((it, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
            <span className="font-medium">{it.q}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-fg-subtle transition-transform", open === i && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <p className="px-4 pb-4 text-sm text-fg-muted">{it.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/* ============================== Overlays ============================== */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useBodyScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  const isMobile = useMediaQuery("(max-width: 639px)");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={isMobile ? { opacity: 0.6, y: "100%" } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0.5, y: "100%" } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className={cn(
              "card glass relative z-10 w-full overflow-hidden elev-3 rounded-b-none sm:rounded-2xl",
              widths[size]
            )}
          >
            {isMobile && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-surface-3" aria-hidden />}
            {title && (
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="pr-4 text-lg font-semibold leading-snug">{title}</h3>
                <IconButton label="Schließen" onClick={onClose} className="shrink-0">
                  <X className="size-5" />
                </IconButton>
              </div>
            )}
            <div className="max-h-[68vh] overflow-y-auto p-5">{children}</div>
            {footer && (
              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface/80 px-5 py-4 backdrop-blur">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function Drawer({
  open,
  onClose,
  side = "left",
  title,
  children,
  width = 300,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  useBodyScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ x: side === "left" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "left" ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            drag="x"
            dragDirectionLock
            dragConstraints={side === "left" ? { left: -width, right: 0 } : { left: 0, right: width }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              const away = side === "left" ? info.offset.x < -72 || info.velocity.x < -480 : info.offset.x > 72 || info.velocity.x > 480;
              if (away) onClose();
            }}
            className={cn("card absolute top-0 bottom-0 z-10 flex flex-col border-0 elev-3", side === "left" ? "left-0" : "right-0")}
            style={{ width, paddingTop: "env(safe-area-inset-top)" }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                <span className="font-semibold">{title}</span>
                <IconButton label="Schließen" onClick={onClose}>
                  <X className="size-5" />
                </IconButton>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:place-items-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 650) onClose();
            }}
            className="card relative z-10 w-full max-w-lg touch-pan-y overflow-hidden rounded-b-none elev-3 sm:rounded-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex justify-center py-2.5 sm:hidden" aria-hidden>
              <div className="h-1.5 w-12 rounded-full bg-surface-3" />
            </div>
            {title && (
              <div className="flex items-center justify-between px-5 pt-4">
                <h3 className="text-lg font-semibold">{title}</h3>
                <IconButton label="Schließen" onClick={onClose}>
                  <X className="size-5" />
                </IconButton>
              </div>
            )}
            <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ============================== Misc ============================== */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} role="status" aria-label="Lädt" />
  );
}

export function EmptyState({
  icon = "Sprout",
  title,
  desc,
  action,
  className,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center", className)}>
      <div className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {desc && <p className="mt-1 max-w-sm text-sm text-fg-muted">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {breadcrumb && (
          <nav className="mb-2 flex items-center gap-1 text-xs text-fg-subtle">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                {b}
              </span>
            ))}
          </nav>
        )}
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {icon && (
            <span className="grid size-9 place-items-center rounded-xl bg-accent/12 text-accent">
              <Icon name={icon} size={18} />
            </span>
          )}
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-fg-muted sm:text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Lightweight hover tooltip (CSS group). */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 z-50 -translate-x-1/2 scale-90 rounded-lg bg-fg px-2.5 py-1 text-xs font-medium text-bg opacity-0 shadow-lg transition-all duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100">
        {content}
      </span>
    </span>
  );
}

/** Click-to-open popover menu (closes on outside-click & ESC). */
export function Popover({
  trigger,
  children,
  align = "start",
  triggerClassName,
  className,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={cn("inline-flex items-center", triggerClassName)}>
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn("absolute z-50 mt-2 min-w-[210px] overflow-hidden rounded-xl border border-border bg-surface p-1 elev-3", align === "end" ? "right-0" : "left-0", className)}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Item inside a Popover menu. */
export function PopoverItem({ icon, children, onClick, danger }: { icon?: string; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors", danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface-2")}
    >
      {icon && <Icon name={icon} size={16} className="shrink-0" />}
      {children}
    </button>
  );
}

/** Generic, accessible data table (horizontal scroll on small screens, zebra rows). */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  renderCell,
  className,
}: {
  columns: { key: string; header: ReactNode; className?: string }[];
  rows: T[];
  getKey: (row: T) => string;
  renderCell: (colKey: string, row: T) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th key={c.key} className={cn("p-4 text-left align-bottom font-medium text-fg-subtle", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={getKey(row)} className={cn("border-b border-border", ri % 2 === 1 && "bg-surface-2/50")}>
              {columns.map((c) => (
                <td key={c.key} className={cn("p-4 align-top", c.className)}>
                  {renderCell(c.key, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
