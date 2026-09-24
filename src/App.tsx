"use client";

import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { DataProvider } from "@/data/DataContext";
import { FeatureProvider, useFeatures } from "@/config/FeatureContext";
import { featureForView } from "@/config/features";
import { ToastProvider } from "@/components/Toast";
import { NavProvider, useNav, type ViewKey } from "@/lib/nav";
import { Background } from "@/components/Particles";
import AppShell from "@/components/layout/AppShell";
import { Button, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { useDelayedReady, usePrefersReducedMotion } from "@/lib/hooks";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Grows from "@/pages/Grows";
import Strains from "@/pages/Strains";
import AIAssistant from "@/pages/AIAssistant";
import Planner from "@/pages/Planner";
import Breeders from "@/pages/Breeders";
import Marketplace from "@/pages/Marketplace";
import Wiki from "@/pages/Wiki";
import Forum from "@/pages/Forum";
import HallOfFame from "@/pages/HallOfFame";
import Social from "@/pages/Social";
import Communities from "@/pages/Communities";
import Showcase from "@/pages/Showcase";
import Calculator from "@/pages/Calculator";
import Consumption from "@/pages/Consumption";
import Simulation from "@/pages/Simulation";
import Report from "@/pages/Report";
import Chat from "@/pages/Chat";
import Notifications from "@/pages/Notifications";
import Profile from "@/pages/Profile";
import Telegram from "@/pages/Telegram";
import Auth from "@/pages/Auth";
import DevAdmin from "@/pages/DevAdmin";
import NotFound from "@/pages/NotFound";

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
  const feat = featureForView(view);
  const Page = views[view] ?? NotFound;
  const ready = useDelayedReady(usePrefersReducedMotion() ? 0 : 300);
  if (!ready) return <PageSkeleton />;
  if (view !== "auth" && !isEnabled(feat)) {
    return (
      <EmptyState
        icon="Lock"
        title="Noch nicht freigeschaltet"
        desc="Diese Funktion ist in der Feature-Config deaktiviert. Im Developer-Admin kannst du Flags umschalten."
        action={<Button variant="soft" onClick={() => navigate("devAdmin")}>Zum Dev-Admin</Button>}
      />
    );
  }
  return <Page />;
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
  const { view } = useNav();
  const { user, loading } = useAuth();
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

  const authed = !!user || loading;
  const showAuth = view === "auth" || !authed;

  return (
    <>
      <Background />
      {showAuth ? (
        <div className="relative z-10">
          {view === "auth" ? <Router /> : <Auth />}
        </div>
      ) : (
        <AppShell>
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
                <NavProvider>
                  <Shell />
                </NavProvider>
              </ToastProvider>
            </FeatureProvider>
          </DataProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
