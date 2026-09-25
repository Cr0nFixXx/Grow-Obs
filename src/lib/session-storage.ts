import { config } from "./config";
import { dbDel } from "./db";

// Separate demo sessions from server sessions. Never send a mock token to the API.
export const sessionKey = config.useMock ? "go-session:mock" : `go-session:api:${config.apiBaseUrl}`;
export function readSessionToken(): string | null {
  try { return localStorage.getItem(sessionKey) ?? sessionStorage.getItem(sessionKey); } catch { return null; }
}
/**
 * `remember = true` → localStorage (bleibt nach Browser-Neustart); `false` → sessionStorage
 * (endet mit dem Tab/Browser). Der jeweils andere Speicher wird geleert.
 */
export function writeSessionToken(token: string | null, remember = true): void {
  try {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    if (token) (remember ? localStorage : sessionStorage).setItem(sessionKey, token);
    localStorage.removeItem("go-token");
  } catch { /* In-memory login still works when browser storage is blocked. */ }
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