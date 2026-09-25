import { useSyncExternalStore } from "react";

/**
 * PWA: Service Worker + Installation.
 * `beforeinstallprompt` feuert früh und nur einmal → Listener hängt beim Modul-Import (app/page.tsx
 * importiert dieses Modul sofort). Der gespeicherte Prompt wird später per Button ausgelöst.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // eigenen Button statt Mini-Infobar
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export type InstallState = "installed" | "prompt" | "ios" | "manual";

export function getInstallState(): InstallState {
  if (typeof window === "undefined") return "manual";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (installed || standalone) return "installed";
  if (deferred) return "prompt";
  // iOS/iPadOS kennt kein beforeinstallprompt → nur „Teilen → Zum Home-Bildschirm“.
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "manual";
}

/** Reaktiver Installationsstatus für Buttons. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getInstallState,
    () => "manual" as InstallState,
  );
}

/** Öffnet den nativen Installationsdialog (nur im Zustand "prompt"). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null; // ein Prompt ist nur einmal verwendbar
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/** Anleitung, falls kein nativer Dialog verfügbar ist. */
export function installHint(state: InstallState): string {
  if (state === "ios") return "In Safari unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.";
  if (state === "installed") return "Grow|Observer ist bereits installiert.";
  return "Im Browser-Menü (⋮) „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen. Tipp: Die Seite einmal kurz nutzen – danach bietet der Browser die Installation an.";
}

/** Sucht nach einer neuen App-Version (Service-Worker-Update). true = neue Version wird aktiviert. */
export async function checkForAppUpdate(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update();
    return !!(reg.installing || reg.waiting);
  } catch {
    return false;
  }
}

/**
 * Service Worker registrieren + Background Sync bei Reconnect (defensiv).
 * Wird von beiden Einstiegen genutzt: app/page.tsx (Next.js) und src/main.tsx (Vite-Legacy).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      /* SW not available in this environment — app still works */
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  window.addEventListener("online", () => {
    navigator.serviceWorker.ready
      .then((reg) => {
        const r = reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        r.sync?.register("go-sync").catch(() => {});
      })
      .catch(() => {});
  });
}
