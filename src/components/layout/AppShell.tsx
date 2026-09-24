import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Bell, ChevronUp, Command, Leaf, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Sun,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav, type ViewKey } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import {
  useAutoHideScroll,
  useEdgeSwipeToOpen,
  useMediaQuery,
  usePullToRefresh,
  useScrollProgress,
} from "@/lib/hooks";
import { vibrate } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, BottomSheet, Button, Drawer, Spinner } from "@/components/ui";
import { navGroups, bottomNav, type NavItem } from "@/components/layout/nav-config";
import { useFeatures } from "@/config/FeatureContext";
import { featureForView } from "@/config/features";
import { useForumThreads, useProducts, useStrains } from "@/data/hooks";
import { currentUser, notifications } from "@/mocks/data";
import { toneSoft } from "@/lib/tokens";

/* ----------------------------- Brand ----------------------------- */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-leaf-400 to-leaf-700 text-white shadow-[0_10px_26px_-8px_var(--accent)]">
        <Leaf size={18} strokeWidth={2.4} />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-leaf-300 ring-2 ring-bg" />
      </div>
      {!compact && (
        <span className="font-display text-[17px] font-bold tracking-tight">
          Grow<span className="text-fg-subtle">|</span>
          <span className="gradient-text">Observer</span>
        </span>
      )}
    </div>
  );
}

/* ----------------------------- Nav link ----------------------------- */
function NavLink({
  item,
  active,
  collapsed,
  lid,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  lid: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "text-accent-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      )}
    >
      {active && (
        <motion.span
          layoutId={`navactive-${lid}`}
          className="absolute inset-0 rounded-xl bg-accent shadow-[0_8px_22px_-10px_var(--accent)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className={cn("relative z-10 flex flex-1 items-center gap-3", collapsed && "justify-center")}>
        <Icon name={item.icon} size={19} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </span>
      {!collapsed && item.badge && (
        <span className="relative z-10 rounded-full bg-black/15 px-1.5 text-[10px] font-semibold">{item.badge}</span>
      )}
    </button>
  );
}

function NavList({ lid, collapsed }: { lid: string; collapsed?: boolean }) {
  const { view, navigate } = useNav();
  const { isEnabled } = useFeatures();
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => isEnabled(featureForView(it.key))) }))
    .filter((g) => g.items.length > 0);
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2 no-scrollbar">
      {groups.map((g) => (
        <div key={g.title}>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{g.title}</div>
          )}
          <div className="space-y-1">
            {g.items.map((it) => (
              <NavLink key={it.key} item={it} active={it.key === view} collapsed={collapsed} lid={lid} onClick={() => navigate(it.key)} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/* ----------------------------- Sidebar ----------------------------- */
function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, navigate } = useNav();
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-surface/90 backdrop-blur-xl lg:flex"
      style={{ width: sidebarCollapsed ? 80 : 272, transition: "width .3s var(--ease-spring)" }}
    >
      <div className="flex h-16 items-center px-4">
        <Brand compact={sidebarCollapsed} />
      </div>
      <NavList lid="side" collapsed={sidebarCollapsed} />
      <div className="border-t border-border p-3">
        <button
          onClick={() => navigate("profile")}
          className={cn("flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2", sidebarCollapsed && "justify-center")}
        >
          <Avatar src={currentUser.avatar} size={36} ring />
          {!sidebarCollapsed && (
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-semibold">{currentUser.name}</span>
              <span className="block truncate text-xs text-fg-subtle">Lvl {currentUser.level} · {currentUser.title}</span>
            </span>
          )}
        </button>
        <button
          onClick={toggleSidebar}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!sidebarCollapsed && "Einklappen"}
        </button>
      </div>
    </aside>
  );
}

/* ----------------------------- Notifications dropdown ----------------------------- */
function NotificationsMenu() {
  const { notifOpen, setNotifOpen, navigate } = useNav();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const unread = notifications.filter((n) => !n.read).length;

  const goAll = () => {
    setNotifOpen(false);
    navigate("notifications");
  };
  const tone = (t: string) =>
    toneSoft[t === "shop" ? "warning" : t === "forum" ? "info" : t === "ai" ? "leaf" : t === "task" ? "warning" : "soil"];
  const icon = (t: string) =>
    t === "ai" ? "Sparkles" : t === "shop" ? "ShoppingBag" : t === "forum" ? "MessagesSquare" : t === "task" ? "ListChecks" : t === "grow" ? "Sprout" : "Bell";

  const rows = notifications.slice(0, 6).map((n) => (
    <button key={n.id} onClick={goAll} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", tone(n.type))}>
        <Icon name={icon(n.type)} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{n.title}</span>
          {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
        </span>
        <span className="block truncate text-xs text-fg-muted">{n.body}</span>
        <span className="text-[11px] text-fg-subtle">{n.time}</span>
      </span>
    </button>
  ));

  // Mobile: slide-up bottom sheet (native pattern, no overflow)
  if (isMobile) {
    return (
      <BottomSheet open={notifOpen} onClose={() => setNotifOpen(false)} title={`Benachrichtigungen · ${unread} neu`}>
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {rows}
          <button onClick={goAll} className="block w-full bg-surface-2/60 px-4 py-3.5 text-center text-sm font-medium text-accent">
            Alle anzeigen
          </button>
        </div>
      </BottomSheet>
    );
  }

  // Desktop: absolute dropdown
  return (
    <AnimatePresence>
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="card glass absolute right-0 top-12 z-50 w-[min(92vw,360px)] overflow-hidden elev-3"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Benachrichtigungen</span>
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">{unread} neu</span>
            </div>
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-border">{rows}</div>
            <button onClick={goAll} className="block w-full border-t border-border px-4 py-3 text-center text-sm font-medium text-accent hover:bg-surface-2">
              Alle anzeigen
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- Top bar ----------------------------- */
function TopBar() {
  const { navigate, setMobileNavOpen, setCommandOpen, notifOpen, setNotifOpen, view } = useNav();
  const { theme, toggle } = useTheme();
  const progress = useScrollProgress([view]);
  return (
    <header
      className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-2xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <motion.div
        className="absolute inset-x-0 top-0 h-0.5 origin-left bg-accent"
        style={{ scaleX: progress, marginTop: "env(safe-area-inset-top)" }}
      />
      <div className="flex h-16 items-center gap-1.5 px-2.5 sm:gap-2 sm:px-5">
        {/* Mobile: always burger menu (dauerhaft) */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="-ml-1 grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 lg:hidden"
          aria-label="Menü öffnen"
        >
          <Menu className="size-5" />
        </button>
        {/* Brand on mobile */}
        <div className="lg:hidden">
          <Brand />
        </div>

        <div className="flex-1" />

        {/* Desktop search */}
        <button
          onClick={() => setCommandOpen(true)}
          className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 text-sm text-fg-subtle transition hover:bg-surface-3 md:flex md:w-64 lg:w-80"
        >
          <Search className="size-4" />
          <span>Suchen…</span>
          <kbd className="ml-auto flex items-center gap-0.5 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium">
            <Command className="size-2.5" />K
          </kbd>
        </button>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={() => setCommandOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 md:hidden"
            aria-label="Suchen"
          >
            <Search className="size-5" />
          </button>
          {/* Theme toggle — hidden on mobile (available in drawer & profile) */}
          <button
            onClick={toggle}
            className="hidden size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:grid"
            aria-label="Theme wechseln"
          >
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label="Benachrichtigungen"
              aria-expanded={notifOpen}
            >
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-bg" />
            </button>
            <NotificationsMenu />
          </div>
          <button onClick={() => navigate("profile")} className="ml-0.5 shrink-0 rounded-full sm:ml-1" aria-label="Profil öffnen">
            <Avatar src={currentUser.avatar} size={38} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------- Bottom nav + FAB ----------------------------- */
const moreNav: { key: ViewKey; label: string; icon: string }[] = [
  { key: "marketplace", label: "Marktplatz", icon: "ShoppingBag" },
  { key: "ai", label: "KI-Assistent", icon: "Sparkles" },
  { key: "wiki", label: "Wiki", icon: "BookOpen" },
  { key: "hallOfFame", label: "Hall of Fame", icon: "Trophy" },
  { key: "social", label: "Community-Feed", icon: "Users" },
  { key: "communities", label: "Communities", icon: "Globe" },
  { key: "chat", label: "Chat", icon: "MessageCircle" },
  { key: "calculator", label: "Kostenrechner", icon: "Euro" },
  { key: "showcase", label: "Design-System", icon: "Layers" },
];

function BottomNav() {
  const { view, navigate } = useNav();
  const { isEnabled } = useFeatures();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = bottomNav.filter((it) => it.key !== "marketplace" && isEnabled(featureForView(it.key)));
  const extra = moreNav.filter((m) => isEnabled(featureForView(m.key)));
  const isMoreActive = extra.some((m) => m.key === view);
  const go = (key: ViewKey) => { vibrate(8); navigate(key); };
  const renderItem = (key: ViewKey, icon: string, label: string, active: boolean, onClick: () => void) => (
    <button key={key} onClick={onClick} aria-current={active ? "page" : undefined} className="relative flex flex-col items-center gap-1 pt-2 pb-2.5 text-[10px] font-medium outline-none">
      {active && <motion.span layoutId="bn-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
      <motion.span animate={{ scale: active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }} className={cn("grid size-9 place-items-center rounded-xl transition-colors", active ? "bg-accent/15 text-accent" : "text-fg-subtle")}>
        <Icon name={icon} size={20} strokeWidth={active ? 2.4 : 2} />
      </motion.span>
      <span className={active ? "text-accent" : "text-fg-subtle"}>{label}</span>
    </button>
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-2xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primary.map((it) => renderItem(it.key, it.icon, it.label, it.key === view, () => go(it.key)))}
          {renderItem("__mehr" as ViewKey, "MoreHorizontal", "Mehr", isMoreActive, () => { vibrate(8); setMoreOpen(true); })}
        </div>
      </nav>
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr Bereiche">
        <div className="grid grid-cols-3 gap-3">
          {extra.map((m) => (
            <button key={m.key} onClick={() => { setMoreOpen(false); go(m.key); }} className={cn("card card-hover flex flex-col items-center gap-2 p-4 text-center", m.key === view && "border-accent ring-2 ring-accent/25")}>
              <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name={m.icon} size={20} /></span>
              <span className="text-sm font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

function Fab() {
  const [open, setOpen] = useState(false);
  const { navigate } = useNav();
  const toast = useToast();
  const actions = [
    { icon: "Sprout", label: "Neuer Grow", view: "grows" as ViewKey, tone: "leaf" },
    { icon: "NotebookPen", label: "Log-Eintrag", view: "grows" as ViewKey, tone: "soil" },
    { icon: "Leaf", label: "Sorte hinzufügen", view: "strains" as ViewKey, tone: "info" },
    { icon: "ListChecks", label: "Task anlegen", view: "dashboard" as ViewKey, tone: "warning" },
  ];
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full bg-gradient-to-br from-leaf-400 to-leaf-700 text-white shadow-[0_16px_40px_-10px_var(--accent)] lg:hidden"
        aria-label="Schnellaktion"
      >
        <Plus className="size-6" />
      </motion.button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Schnellaktion">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setOpen(false);
                navigate(a.view);
                toast.push({ title: a.label, desc: "Demo-Aktion ausgelöst.", tone: a.tone as never, icon: a.icon });
              }}
              className="card card-hover flex flex-col items-center gap-2 p-4 text-center"
            >
              <span className={cn("grid size-11 place-items-center rounded-xl", toneSoft[a.tone as never])}>
                <Icon name={a.icon} size={20} />
              </span>
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

/* ----------------------------- Command palette ----------------------------- */
function CommandPalette() {
  const { commandOpen, setCommandOpen, navigate } = useNav();
  const { isEnabled } = useFeatures();
  const [q, setQ] = useState("");
  const all = useMemo(
    () => navGroups.flatMap((g) => g.items).filter((i) => isEnabled(featureForView(i.key))),
    [isEnabled]
  );
  const results = q ? all.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : all;

  // Inhalts-Suche (Sorten, Threads, Produkte) — nur bei Query
  const { strains } = useStrains();
  const { threads } = useForumThreads();
  const { products } = useProducts();
  const query = q.trim().toLowerCase();
  type ContentItem = { key: string; icon: string; label: string; hint: string; view: ViewKey; params?: Record<string, string> };
  const content: ContentItem[] = query
    ? [
        ...strains.filter((s) => `${s.name} ${s.breeder}`.toLowerCase().includes(query)).slice(0, 4)
          .map((s): ContentItem => ({ key: `strain-${s.id}`, icon: "Leaf", label: s.name, hint: `Sorte · ${s.breeder}`, view: "strains" })),
        ...threads.filter((t) => `${t.title} ${t.sub}`.toLowerCase().includes(query)).slice(0, 4)
          .map((t): ContentItem => ({ key: `thread-${t.id}`, icon: "MessagesSquare", label: t.title, hint: `Thread · ${t.sub}`, view: "forum", params: { threadId: t.id } })),
        ...products.filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(query)).slice(0, 4)
          .map((p): ContentItem => ({ key: `product-${p.id}`, icon: "Package", label: p.name, hint: `Produkt · ${p.brand}`, view: "marketplace" })),
      ]
    : [];

  const go = (item: { view: ViewKey; params?: Record<string, string> }) => {
    navigate(item.view, item.params);
    setCommandOpen(false);
    setQ("");
  };

  useEffect(() => {
    if (!commandOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  return createPortal(
    <AnimatePresence>
      {commandOpen && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCommandOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="card glass relative z-10 w-full max-w-xl overflow-hidden elev-3"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 text-fg-subtle" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Wonach suchst du? (Seiten, Sorten, Tools…)"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle"
              />
              <kbd className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px]">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {results.map((r) => (
                <button
                  key={r.key}
                  onClick={() => go({ view: r.key })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent">
                    <Icon name={r.icon} size={17} />
                  </span>
                  <span className="flex-1 text-sm font-medium">{r.label}</span>
                  <ArrowLeft className="size-4 rotate-180 text-fg-subtle" />
                </button>
              ))}
              {content.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Inhalt</div>
                  {content.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => go({ view: r.view, params: r.params })}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                        <Icon name={r.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.label}</span>
                        <span className="block truncate text-xs text-fg-subtle">{r.hint}</span>
                      </span>
                      <ArrowLeft className="size-4 rotate-180 text-fg-subtle" />
                    </button>
                  ))}
                </>
              )}
              {results.length === 0 && content.length === 0 && <div className="px-3 py-8 text-center text-sm text-fg-subtle">Keine Treffer für „{q}“.</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ----------------------------- Mobile drawer ----------------------------- */
function MobileDrawer() {
  const { mobileNavOpen, setMobileNavOpen, navigate } = useNav();
  const { theme, toggle } = useTheme();
  return (
    <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left" width={300} title="">
      <div className="-mt-2 mb-3 flex items-center justify-between">
        <Brand />
        <button
          onClick={toggle}
          className="grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:hidden"
          aria-label="Theme wechseln"
        >
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>
      <NavList lid="drawer" />
      <div className="mt-3 space-y-2">
        <Button className="w-full" variant="soft" onClick={() => { navigate("auth"); }}>
          <Icon name="Power" size={16} /> Login / Registrieren
        </Button>
      </div>
    </Drawer>
  );
}

/* ----------------------------- Scroll to top ----------------------------- */
function ScrollToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 12 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-40 grid size-11 place-items-center rounded-full border border-border bg-surface/90 text-fg backdrop-blur-xl elev-2 lg:hidden"
          aria-label="Nach oben scrollen"
        >
          <ChevronUp className="size-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- Auto-hide scrollbar (mobile) ----------------------------- */
function MobileScrollbar() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { visible, thumb } = useAutoHideScroll();
  if (!isMobile) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 z-50 w-2">
      <div
        className="absolute right-0.5 w-1.5 rounded-full bg-fg/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0, top: thumb.top, height: Math.max(0, thumb.height) }}
      />
    </div>
  );
}

/* ----------------------------- Pull-to-refresh ----------------------------- */
function PullToRefresh() {
  const toast = useToast();
  const { distance, refreshing } = usePullToRefresh(() => {
    toast.push({ title: "Aktualisiert", desc: "Alles auf dem neuesten Stand.", tone: "leaf", icon: "CheckCircle2" });
    return new Promise<void>((res) => window.setTimeout(res, 500));
  });
  const active = distance > 0 || refreshing;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
      style={{ transform: `translateY(${Math.max(0, distance - 42)}px)`, opacity: active ? 1 : 0, transition: refreshing ? "none" : "transform .25s ease, opacity .2s ease" }}
    >
      <div className="mt-2 grid size-9 place-items-center rounded-full border border-border bg-surface elev-2">
        {refreshing ? (
          <Spinner className="size-4 text-accent" />
        ) : (
          <Icon name="ChevronDown" size={18} className={cn("text-accent transition-transform duration-200", distance > 40 && "rotate-180")} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Edge-Swipe: Menü öffnen ----------------------------- */
/**
 * Passiver window-Listener statt Overlay-DOM: blockiert keine Klicks und kein
 * horizontales Scrollen (Tabs/Ticker/Stories) am linken Rand mehr.
 */
function EdgeSwipeOpen() {
  const { setMobileNavOpen, mobileNavOpen } = useNav();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const open = useCallback(() => setMobileNavOpen(true), [setMobileNavOpen]);
  const enabled = !isDesktop && !mobileNavOpen;
  useEdgeSwipeToOpen(open, enabled);
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { sidebarCollapsed, setCommandOpen, commandOpen } = useNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen, commandOpen]);

  return (
    <div className="relative min-h-screen">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-fg focus:elev-3">Zum Inhalt springen</a>
      <Sidebar />
      <div
        style={{ "--sb-w": `${sidebarCollapsed ? 80 : 272}px` } as React.CSSProperties}
        className="transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:pl-[var(--sb-w)]"
      >
        <TopBar />
        <main id="app-main" className="mx-auto w-full max-w-[1440px] px-3.5 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
      <Fab />
      <EdgeSwipeOpen />
      <MobileDrawer />
      <CommandPalette />
      <ScrollToTop />
      <MobileScrollbar />
      <PullToRefresh />
    </div>
  );
}
