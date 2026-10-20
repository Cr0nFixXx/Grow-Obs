import { useEffect } from "react";
import { useFeatures } from "@/config/FeatureContext";
import { config } from "@/lib/config";
import { useNav } from "@/lib/nav";
import { pushNavigationTarget, syncPushSubscription } from "@/lib/push";
import { parsePath } from "@/lib/routes";

/** Web-Push-Anbindung der angemeldeten App (B-63): Abo mit der Sitzung abgleichen, Klick auf eine Meldung → Ziel-Ansicht. */
export function PushBridge() {
  const { navigate } = useNav();
  const { isEnabled } = useFeatures();
  const enabled = !config.useMock && isEnabled("push");

  useEffect(() => { if (enabled) void syncPushSubscription().catch(() => undefined); }, [enabled]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const url = pushNavigationTarget(event.data);
      const target = url ? parsePath(new URL(url, window.location.origin).pathname) : null;
      if (target) navigate(target.view, target.params ?? undefined);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}
