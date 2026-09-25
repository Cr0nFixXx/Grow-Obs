import { useState } from "react";
import { useToast } from "@/components/Toast";
import { installHint, promptInstall, useInstallState } from "@/lib/pwa";

/**
 * Installations-Aktion: nativer Dialog, wenn der Browser ihn anbietet; sonst verständliche Anleitung
 * (iOS: Teilen → Home-Bildschirm). Liefert `run()` + Status für eigene Buttons.
 */
export function useInstallApp() {
  const state = useInstallState();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (): Promise<boolean> => {
    if (state === "prompt") {
      setBusy(true);
      try {
        const outcome = await promptInstall();
        if (outcome === "accepted") {
          toast.push({ title: "App wird installiert", desc: "Du findest Grow|Observer gleich auf dem Startbildschirm.", tone: "leaf", icon: "Download" });
          return true;
        }
        return false;
      } finally {
        setBusy(false);
      }
    }
    toast.push({ title: state === "installed" ? "Bereits installiert" : "So installierst du die App", desc: installHint(state), tone: "info", icon: "Download" });
    return state === "installed";
  };
  return { state, busy, run };
}
