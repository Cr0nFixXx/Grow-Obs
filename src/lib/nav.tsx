import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** All available top-level views (used by sidebar / bottom-nav / router). */
export type ViewKey =
  | "dashboard"
  | "grows"
  | "strains"
  | "ai"
  | "planner"
  | "breeders"
  | "marketplace"
  | "wiki"
  | "forum"
  | "hallOfFame"
  | "social"
  | "communities"
  | "showcase"
  | "calculator"
  | "consumption"
  | "simulation"
  | "report"
  | "chat"
  | "notifications"
  | "profile"
  | "telegram"
  | "auth"
  | "devAdmin"
  | "create";

export interface NavParams {
  id?: string;
  breederId?: string;
  strainId?: string;
  growId?: string;
  threadId?: string;
  articleId?: string;
  agentId?: string;
  tab?: string;
  [key: string]: string | undefined;
}

interface StackEntry {
  view: ViewKey;
  params: NavParams | null;
}

interface NavContextValue {
  view: ViewKey;
  params: NavParams | null;
  navigate: (view: ViewKey, params?: NavParams) => void;
  back: () => void;
  canGoBack: boolean;
  /** Mobile slide-in drawer */
  mobileNavOpen: boolean;
  setMobileNavOpen: (b: boolean) => void;
  /** Desktop collapsible sidebar */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Command palette (search) */
  commandOpen: boolean;
  setCommandOpen: (b: boolean) => void;
  /** Notifications dropdown */
  notifOpen: boolean;
  setNotifOpen: (b: boolean) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

/**
 * Lightweight view-based router. Avoids react-router to keep the
 * single-file build self-contained while still enabling page transitions.
 */
/** Deep-Links: `/?view=social#post-…` öffnet die View (nur bekannte, öffentliche Keys). */
const LINKABLE_VIEWS: ViewKey[] = ["dashboard", "grows", "strains", "wiki", "forum", "hallOfFame", "social", "communities", "marketplace", "planner", "breeders"];
function initialView(): ViewKey {
  if (typeof window === "undefined") return "dashboard";
  const requested = new URLSearchParams(window.location.search).get("view") as ViewKey | null;
  return requested && LINKABLE_VIEWS.includes(requested) ? requested : "dashboard";
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewKey>(initialView);
  const [params, setParams] = useState<NavParams | null>(null);
  const [stack, setStack] = useState<StackEntry[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navigate = useCallback(
    (next: ViewKey, nextParams?: NavParams) => {
      setStack((s) => [...s, { view, params }]);
      setView(next);
      setParams(nextParams ?? null);
      setMobileNavOpen(false);
      setNotifOpen(false);
      setCommandOpen(false);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "auto" });
        const main = document.getElementById("app-scroll");
        if (main) main.scrollTo({ top: 0, behavior: "auto" });
      }
    },
    [view, params]
  );

  const back = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setView(prev.view);
      setParams(prev.params);
      return s.slice(0, -1);
    });
  }, []);

  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((c) => !c),
    []
  );

  const value = useMemo<NavContextValue>(
    () => ({
      view,
      params,
      navigate,
      back,
      canGoBack: stack.length > 0,
      mobileNavOpen,
      setMobileNavOpen,
      sidebarCollapsed,
      toggleSidebar,
      commandOpen,
      setCommandOpen,
      notifOpen,
      setNotifOpen,
    }),
    [view, params, navigate, back, stack.length, mobileNavOpen, sidebarCollapsed, toggleSidebar, commandOpen, notifOpen]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
