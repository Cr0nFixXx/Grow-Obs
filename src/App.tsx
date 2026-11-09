"use client";

import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "@/lib/theme";
import { isPlatformModerator } from "@/lib/moderation-scope";
import { useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { DataProvider } from "@/data/DataContext";
import { FeatureProvider, useFeatures } from "@/config/FeatureContext";
import { featureForView } from "@/config/features";
import { ToastProvider } from "@/components/Toast";
import { UpdateProvider } from "@/lib/update";
import { UpdateLayer } from "@/components/UpdateUI";
import { RealtimeProvider } from "@/lib/realtime-context";
import { PushBridge } from "@/components/PushBridge";
import { SoundBridge } from "@/components/SoundBridge";
import { useRealtimeBridge } from "@/data/hooks";
import { NavProvider, useNav, type ViewKey } from "@/lib/nav";
import { Background } from "@/components/Particles";
import AppShell from "@/components/layout/AppShell";
import { Button, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { useDelayedReady, usePrefersReducedMotion } from "@/lib/hooks";
import Onboarding from "@/views/Onboarding";
import Auth from "@/views/Auth";
import { ForcedPasswordChange } from "@/components/AccountSecurity";
import { AccountLinkPage, EmailVerificationGate, clearAccountLink, parseAccountLink, type AccountLink } from "@/components/AccountLinks";
import NotFound from "@/views/NotFound";

/* Views werden einzeln nachgeladen (Code-Splitting). Shell-kritische Views bleiben eager. */
const Dashboard = lazy(() => import("@/views/Dashboard"));
const Moderation = lazy(() => import("@/views/Moderation"));
const MemberProfile = lazy(() => import("@/views/MemberProfile"));
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
  member: MemberProfile,
  telegram: Telegram,
  auth: Auth,
  devAdmin: DevAdmin,
  moderation: Moderation,
  create: Create,
  notFound: NotFound,
};

/** Seitentitel je Ansicht (Browser-Tab, Verlauf, Screenreader-Ansage beim Wechsel). */
const TITLES: Record<ViewKey, string> = {
  dashboard: "Dashboard", grows: "Grows", strains: "Sorten", ai: "KI-Assistent", planner: "Planer", breeders: "Breeder", marketplace: "Marktplatz",
  wiki: "Wiki", forum: "Forum", hallOfFame: "Hall of Fame", social: "Community-Feed", communities: "Communities", showcase: "Showcase",
  calculator: "Rechner", consumption: "Verbrauch", simulation: "Simulation", report: "Report", chat: "Chat", notifications: "Benachrichtigungen",
  profile: "Profil", member: "Mitglied", telegram: "Telegram", auth: "Anmelden", devAdmin: "Betrieb", moderation: "Moderation", create: "Erstellen", notFound: "Nicht gefunden",
};

function Router() {
  const { view } = useNav();
  useEffect(() => { document.title = `${TITLES[view]} · Grow|Observer`; }, [view]);
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
  if (view === "moderation" && !isPlatformModerator(user?.role)) {
    return <EmptyState icon="Lock" title="Kein Moderationszugang" desc="Dieser Bereich ist den Plattform-Rollen Moderator, Admin und Betreiber vorbehalten." action={<Button onClick={() => navigate("dashboard")}>Zum Dashboard</Button>} />;
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

/** Übersetzt Echtzeit-Ereignisse in Datenaktualisierungen (rendert nichts). */
function RealtimeBridge() {
  useRealtimeBridge();
  return null;
}

function Shell() {
  usePrefetchPrimaryViews();
  const { view } = useNav();
  const { user, loading, sessionError, retrySession, logout } = useAuth();
  const [onboard, setOnboard] = useState(false);
  // B-87: Links aus E-Mails (`/#verify=…`, `/#reset=…`) – unabhängig von Anmeldung und Ansicht.
  const [accountLink, setAccountLink] = useState<AccountLink | null>(() => (typeof window === "undefined" ? null : parseAccountLink(window.location.hash)));
  const closeAccountLink = () => { clearAccountLink(); setAccountLink(null); };
  useEffect(() => {
    const onHash = () => { const next = parseAccountLink(window.location.hash); if (next) setAccountLink(next); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
  if (accountLink) return <><Background /><AccountLinkPage link={accountLink} onDone={closeAccountLink} /></>;
  // Einmalpasswort (B-58): bis zum Wechsel nur die Passwort-Sperre zeigen, unabhängig von der URL/Ansicht.
  if (user?.mustChangePassword) return <><Background /><ForcedPasswordChange /></>;
  // E-Mail-Bestätigung (B-87): nur wenn der Server Mails versenden kann; bis dahin lehnt er fast alles ab.
  if (user?.emailVerificationPending) return <><Background /><EmailVerificationGate /></>;
  const showAuth = view === "auth" || !user;

  return (
    <>
      <Background />
      {showAuth ? (
        <div className="relative z-10">
          {view === "auth" ? <Router /> : <Auth />}
        </div>
      ) : (
        <RealtimeProvider key={user?.id}>
          <RealtimeBridge />
          <PushBridge />
          <SoundBridge />
          <AppShell>
            <Router />
          </AppShell>
        </RealtimeProvider>
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
