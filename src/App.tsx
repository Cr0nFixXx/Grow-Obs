"use client";

import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { DataProvider } from "@/data/DataContext";
import { FeatureProvider, useFeatures } from "@/config/FeatureContext";
import { featureForView } from "@/config/features";
import { ToastProvider } from "@/components/Toast";
import { UpdateProvider } from "@/lib/update";
import { UpdateLayer } from "@/components/UpdateUI";
import { NavProvider, useNav, type ViewKey } from "@/lib/nav";
import { Background } from "@/components/Particles";
import AppShell from "@/components/layout/AppShell";
import { Button, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { useDelayedReady, usePrefersReducedMotion } from "@/lib/hooks";
import Onboarding from "@/views/Onboarding";
import Auth from "@/views/Auth";
import NotFound from "@/views/NotFound";

/* Views werden einzeln nachgeladen (Code-Splitting). Shell-kritische Views bleiben eager. */
const Dashboard = lazy(() => import("@/views/Dashboard"));
const Grows = lazy(() => import("@/views/Grows"));
const Strains = lazy(() => import("@/views/Strains"));
const AIAssistant = lazy(() => import("@/views/AIAssistant"));
const Planner = lazy(() => import("@/views/Planner"));
const Breeders = lazy(() => import("@/views/Breeders"));
const Marketplace = lazy(() => import("@/views/Marketplace"));
const Wiki = lazy(() => import("@/views/Wiki"));
const Forum = lazy(() => import("@/views/Forum"));
const HallOfFame = lazy(() => import("@/views/HallOfFame"));
const Social = lazy(() => import("@/views/Social"));
const Communities = lazy(() => import("@/views/Communities"));
const Showcase = lazy(() => import("@/views/Showcase"));
const Calculator = lazy(() => import("@/views/Calculator"));
const Consumption = lazy(() => import("@/views/Consumption"));
const Simulation = lazy(() => import("@/views/Simulation"));
const Report = lazy(() => import("@/views/Report"));
const Chat = lazy(() => import("@/views/Chat"));
const Notifications = lazy(() => import("@/views/Notifications"));
const Profile = lazy(() => import("@/views/Profile"));
const Telegram = lazy(() => import("@/views/Telegram"));
const DevAdmin = lazy(() => import("@/views/DevAdmin"));
const Create = lazy(() => import("@/views/Create"));

/** Häufige Ziele (Bottom-Nav) im Leerlauf vorladen → Tab-Wechsel ohne Ladepause. */
function usePrefetchPrimaryViews() {
  useEffect(() => {
    const load = () => { void import("@/views/Dashboard"); void import("@/views/Grows"); void import("@/views/Forum"); void import("@/views/Profile"); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(load) : window.setTimeout(load, 1200);
    return () => { if (!w.requestIdleCallback) window.clearTimeout(id); };
  }, []);
}

const views: Record<ViewKey, ComponentType> = {
  dashboard: Dashboard,
  grows: Grows,
  strains: Strains,
  ai: AIAssistant,
  planner: Planner,
  breeders: Breeders,
  marketplace: Marketplace,
  wiki: Wiki,
  forum: Forum,
  hallOfFame: HallOfFame,
  social: Social,
  communities: Communities,
  showcase: Showcase,
  calculator: Calculator,
  consumption: Consumption,
  simulation: Simulation,
  report: Report,
  chat: Chat,
  notifications: Notifications,
  profile: Profile,
  telegram: Telegram,
  auth: Auth,
  devAdmin: DevAdmin,
  create: Create,
};

function Router() {
  const { view } = useNav();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <AsyncPage view={view} />
      </motion.div>
    </AnimatePresence>
  );
}

/** Short skeleton flash on view change (reduced-motion → instant). */
function AsyncPage({ view }: { view: ViewKey }) {
  const { isEnabled } = useFeatures();
  const { navigate } = useNav();
  const { user } = useAuth();
  const feat = featureForView(view);
  const Page = views[view] ?? NotFound;
  const ready = useDelayedReady(usePrefersReducedMotion() ? 0 : 300);
  if (!ready) return <PageSkeleton />;
  if (view === "devAdmin" && user?.role !== "platform_admin") {
    return <EmptyState icon="Lock" title="Kein Betreiberzugang" desc="Dieser Bereich ist Plattform-Admins vorbehalten." action={<Button onClick={() => navigate("dashboard")}>Zum Dashboard</Button>} />;
  }
  if (view !== "auth" && !isEnabled(feat)) {
    return (
      <EmptyState
        icon="Lock"
        title="Noch nicht freigeschaltet"
        desc="Diese Funktion ist derzeit deaktiviert."
        action={<Button variant="soft" onClick={() => navigate(user?.role === "platform_admin" ? "devAdmin" : "dashboard")}>{user?.role === "platform_admin" ? "Zum Dev-Admin" : "Zum Dashboard"}</Button>}
      />
    );
  }
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Page />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function Shell() {
  usePrefetchPrimaryViews();
  const { view } = useNav();
  const { user, loading, sessionError, retrySession, logout } = useAuth();
  const [onboard, setOnboard] = useState(false);

  useEffect(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      window.setTimeout(() => boot.remove(), 440);
    }
    try {
      if (localStorage.getItem("go-onboarded") !== "1") setOnboard(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (loading) return <div className="grid min-h-dvh place-items-center p-6" role="status"><p>Sitzung wird geprüft…</p></div>;
  if (sessionError) return <div className="mx-auto max-w-lg px-4 py-20"><EmptyState icon="Cloud" title="Verbindung erforderlich" desc={sessionError} action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={retrySession}>Erneut versuchen</Button><Button variant="secondary" onClick={logout}>Abmelden</Button></div>} /></div>;
  const showAuth = view === "auth" || !user;

  return (
    <>
      <Background />
      {showAuth ? (
        <div className="relative z-10">
          {view === "auth" ? <Router /> : <Auth />}
        </div>
      ) : (
        <AppShell key={user?.id}>
          <Router />
        </AppShell>
      )}
      <Onboarding
        open={onboard}
        onClose={() => {
          setOnboard(false);
          try {
            localStorage.setItem("go-onboarded", "1");
          } catch {
            /* ignore */
          }
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <DataProvider>
            <FeatureProvider>
              <ToastProvider>
                <UpdateProvider>
                  <NavProvider>
                    <Shell />
                    <UpdateLayer />
                  </NavProvider>
                </UpdateProvider>
              </ToastProvider>
            </FeatureProvider>
          </DataProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
