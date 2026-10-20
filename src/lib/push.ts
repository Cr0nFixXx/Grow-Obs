import { http } from "@/lib/api";
import { getInstallState } from "@/lib/pwa";

/**
 * Web-Push im Browser (B-63): Fähigkeit prüfen, Abo anlegen/entfernen, Abo mit der Sitzung abgleichen.
 * Der Server entscheidet, wann gesendet wird (Kategorien, Ruhezeit, online → kein Push).
 */
export type PushSupport = "ok" | "unsupported" | "needs-install";

export interface PushPrefs {
  messages: boolean; community: boolean; grows: boolean; other: boolean; showPreview: boolean;
  quietEnabled: boolean; quietStart: string; quietEnd: string; timezone: string;
}
export interface PushDevice { id: string; device: string; createdAt: string; current: boolean }
export interface PushState { configured: boolean; prefs: PushPrefs; devices: PushDevice[] }

export class PushError extends Error {
  constructor(readonly code: "denied" | "unsupported" | "no-worker" | "failed", message: string) { super(message); }
}

/** iOS/iPadOS: Push gibt es nur in der installierten Web-App (ab iOS 16.4) – im Safari-Tab fehlt die API. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if (getInstallState() === "ios") return "needs-install";
  return "PushManager" in window && "Notification" in window ? "ok" : "unsupported";
}

export const notificationPermission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms))]);

async function registration(create: boolean): Promise<ServiceWorkerRegistration | null> {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg && create) reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  if (!reg) return null;
  return withTimeout(navigator.serviceWorker.ready, 8000);
}

/** Das Abo dieses Browsers (falls vorhanden). */
export async function localSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await registration(false);
  return reg ? reg.pushManager.getSubscription() : null;
}

const body = (sub: PushSubscription) => {
  const json = sub.toJSON();
  return { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } };
};

/** Muss direkt aus einem Klick aufgerufen werden (Berechtigungsdialog verlangt eine Nutzeraktion). */
export async function enablePush(publicKey: string): Promise<PushState> {
  if (pushSupport() !== "ok") throw new PushError("unsupported", "Dieser Browser unterstützt keine Push-Benachrichtigungen.");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new PushError("denied", "Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.");
  const reg = await registration(true);
  if (!reg) throw new PushError("no-worker", "Der Service Worker ist nicht verfügbar (in der Entwicklung nur im Produktions-Build).");
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }).catch((e: unknown) => {
    throw new PushError("failed", e instanceof Error ? e.message : "Anmeldung beim Push-Dienst fehlgeschlagen.");
  });
  return http.post<PushState>("/push/subscribe", body(sub));
}

/** Gerät abmelden: Browser-Abo beenden und den Server-Eintrag löschen. */
export async function disablePush(): Promise<PushState> {
  const sub = await localSubscription();
  if (!sub) return http.get<PushState>("/push");
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  return http.post<PushState>("/push/unsubscribe", { endpoint });
}

/**
 * Beim Start der angemeldeten App: ein vorhandenes Browser-Abo mit der aktuellen Sitzung verknüpfen (nach erneuter Anmeldung
 * hängt das Abo sonst an einer beendeten Sitzung) und einen vom Browser erneuerten Endpunkt melden. Still, ohne Dialog.
 */
export async function syncPushSubscription(): Promise<void> {
  if (notificationPermission() !== "granted") return;
  const sub = await localSubscription();
  if (sub) await http.post("/push/subscribe", body(sub));
}

/** Nachricht des Service Workers nach Antippen einer Meldung: Zielpfad der App. */
export function pushNavigationTarget(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  return type === "GO_NAVIGATE" && typeof url === "string" && /^\/(?!\/)/.test(url) ? url : null;
}
