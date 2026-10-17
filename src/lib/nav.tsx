import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { config } from "@/lib/config";
import { parseLegacyQuery, parsePath, pathFor } from "@/lib/routes";

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
  | "create"
  | "notFound";

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

interface NavContextValue {
  view: ViewKey;
  params: NavParams | null;
  navigate: (view: ViewKey, params?: NavParams) => void;
  /** Parameter der aktuellen Ansicht ersetzen (kein neuer History-Eintrag). */
  replaceParams: (params: NavParams | null) => void;
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
 * Leichtgewichtiger View-Router (ohne react-router, damit der Legacy-Einzeldatei-Build eigenständig bleibt).
 * Seit B-57 ist er an die Browser-History gekoppelt: Unter Next.js spiegelt die URL die Ansicht (`/grows/123`,
 * siehe `routes.ts`), Reload und Teilen funktionieren, Zurück/Vorwärts (auch Wischgeste) gehen durch die Ansichten.
 * Im Vite-Legacy-Build bleibt die URL unverändert (`/?view=…`), nur die History-Einträge kommen dazu.
 */
interface HistoryState { idx: number; view: ViewKey; params: NavParams | null }

/** Start-Ansicht aus der Adresszeile (Pfad; alter `?view=`-Link nur als Rückfall). Unbekannter Pfad → 404-Ansicht (B-62). */
function entryFromLocation(): { view: ViewKey; params: NavParams | null } {
  if (typeof window === "undefined") return { view: "dashboard", params: null };
  const { pathname, search } = window.location;
  const legacy = parseLegacyQuery(search);
  if (!config.pathRouting) return { view: legacy ?? "dashboard", params: null };
  const parsed = parsePath(pathname);
  if (parsed && pathname === "/" && legacy) return { view: legacy, params: null };
  return parsed ?? { view: "notFound", params: null };
}
const currentIdx = () => (typeof window === "undefined" ? 0 : ((window.history.state as HistoryState | null)?.idx ?? 0));
/** Adresse für einen History-Eintrag: Pfad (Next) bzw. unverändert (Legacy). */
const urlFor = (view: ViewKey, params: NavParams | null) =>
  config.pathRouting && view !== "notFound" ? pathFor(view, params) : `${window.location.pathname}${window.location.search}`;

export function NavProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(entryFromLocation);
  const [view, setView] = useState<ViewKey>(initial.view);
  const [params, setParams] = useState<NavParams | null>(initial.params);
  const [idx, setIdx] = useState(currentIdx);
  const idxRef = useRef(idx);
  const current = useRef({ view: initial.view, params: initial.params });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const closeOverlays = useCallback(() => { setMobileNavOpen(false); setNotifOpen(false); setCommandOpen(false); }, []);
  const apply = useCallback((nextView: ViewKey, nextParams: NavParams | null, nextIdx: number) => {
    current.current = { view: nextView, params: nextParams };
    idxRef.current = nextIdx;
    setView(nextView); setParams(nextParams); setIdx(nextIdx);
  }, []);

  // Beim Start den aktuellen Eintrag normalisieren (alter ?view=-Link → Pfad; bei der 404-Ansicht bleibt die falsche Adresse stehen; Hash bleibt).
  useEffect(() => {
    window.history.replaceState({ idx: idxRef.current, view: initial.view, params: initial.params } satisfies HistoryState, "", `${urlFor(initial.view, initial.params)}${window.location.hash}`);
  }, [initial]);

  // Zurück/Vorwärts: Ansicht aus dem History-Eintrag wiederherstellen (ohne Eintrag: aus der Adresse lesen).
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const st = event.state as HistoryState | null;
      const target = st?.view ? { view: st.view, params: st.params ?? null } : entryFromLocation();
      apply(target.view, target.params, st?.idx ?? 0);
      closeOverlays();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [apply, closeOverlays]);

  const navigate = useCallback(
    (next: ViewKey, nextParams?: NavParams) => {
      const p = nextParams ?? null;
      const same = current.current.view === next && JSON.stringify(current.current.params) === JSON.stringify(p);
      if (!same) {
        const nextIdx = idxRef.current + 1;
        window.history.pushState({ idx: nextIdx, view: next, params: p } satisfies HistoryState, "", urlFor(next, p));
        apply(next, p, nextIdx);
      }
      closeOverlays();
      window.scrollTo({ top: 0, behavior: "auto" });
      document.getElementById("app-scroll")?.scrollTo({ top: 0, behavior: "auto" });
    },
    [apply, closeOverlays]
  );

  /** Parameter der aktuellen Ansicht ändern (z. B. Profil-Tab) – ersetzt den History-Eintrag, statt einen neuen anzulegen. */
  const replaceParams = useCallback((nextParams: NavParams | null) => {
    const v = current.current.view;
    window.history.replaceState({ idx: idxRef.current, view: v, params: nextParams } satisfies HistoryState, "", urlFor(v, nextParams));
    current.current = { view: v, params: nextParams };
    setParams(nextParams);
  }, []);

  /** Eine Ansicht zurück. Ohne eigene History (direkt geöffneter Link): von der Detail- zur Listenansicht, sonst zum Dashboard. */
  const back = useCallback(() => {
    if (idxRef.current > 0) { window.history.back(); return; }
    const { view: v, params: p } = current.current;
    navigate(p && Object.keys(p).length ? v : "dashboard");
  }, [navigate]);

  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((c) => !c),
    []
  );

  const value = useMemo<NavContextValue>(
    () => ({
      view,
      params,
      navigate,
      replaceParams,
      back,
      canGoBack: idx > 0,
      mobileNavOpen,
      setMobileNavOpen,
      sidebarCollapsed,
      toggleSidebar,
      commandOpen,
      setCommandOpen,
      notifOpen,
      setNotifOpen,
    }),
    [view, params, navigate, replaceParams, back, idx, mobileNavOpen, sidebarCollapsed, toggleSidebar, commandOpen, notifOpen]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
