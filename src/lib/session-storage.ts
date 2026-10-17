import { config } from "./config";
import { dbDel } from "./db";

/**
 * Das Sitzungs-Token liegt ausschließlich in einem HttpOnly-Cookie und ist für JavaScript unsichtbar.
 * Hier steht nur ein **nicht geheimer Marker** („in diesem Browser angemeldet“): Er erspart anonymen Besuchern
 * die Sitzungsprüfung und synchronisiert Tabs über das `storage`-Event.
 */
export const sessionKey = config.useMock ? "go-session:mock" : `go-session:api:${config.apiBaseUrl}`;
const MARKER = "1";

/** `true`, wenn dieser Browser eine Sitzung erwartet. Alte Token aus früheren Versionen werden dabei verworfen. */
export function readSessionMarker(): boolean {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const value = storage.getItem(sessionKey);
      if (value === null) continue;
      if (value === MARKER) return true;
      storage.removeItem(sessionKey); // Altlast: Bearer-JWT aus B-51/B-52 darf nicht im Speicher bleiben.
    }
  } catch { /* Speicher gesperrt → anonym */ }
  return false;
}

/**
 * `remember = true` → localStorage (bleibt nach Browser-Neustart); `false` → sessionStorage
 * (endet mit dem Tab/Browser, passend zum Session-Cookie). Der jeweils andere Speicher wird geleert.
 */
export function writeSessionMarker(signedIn: boolean, remember = true): void {
  try {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    if (signedIn) (remember ? localStorage : sessionStorage).setItem(sessionKey, MARKER);
    localStorage.removeItem("go-token");
  } catch { /* Anmeldung funktioniert auch ohne Browser-Speicher (nur ohne Tab-Sync). */ }
}

export async function clearLegacyPrivateStorage(): Promise<void> {
  try {
    localStorage.removeItem("go-token");
    localStorage.removeItem("go-dev-log");
  } catch { /* Browser storage can be blocked. */ }
  await dbDel("social-posts").catch(() => undefined);
  if (typeof caches !== "undefined") {
    const names = await caches.keys().catch(() => [] as string[]);
    await Promise.all(names.filter((name) => /^go-(shell|runtime|images)-/.test(name) && name !== "go-shell-v4-next")
      .map((name) => caches.delete(name).catch(() => false)));
  }
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHES" });
  }
}
