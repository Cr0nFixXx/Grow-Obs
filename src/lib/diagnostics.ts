import { config } from "./config";

export interface HealthResult {
  id: string;
  label: string;
  status: "ok" | "down" | "unknown";
  hint: string;
  latencyMs?: number;
  detail?: string;
}

/** fetch mit Timeout (damit Health-Checks nicht hängen). */
async function ping(url: string, timeout = 2500): Promise<{ ok: boolean; ms: number; status?: number }> {
  const started = performance.now();
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    return { ok: res.ok, ms: Math.round(performance.now() - started), status: res.status };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started) };
  } finally {
    window.clearTimeout(t);
  }
}

/**
 * Prüft die Erreichbarkeit des Backends (Mock-Modus → unknown/offline statt Fehler).
 * Ein einziger /health-Call deckt API + DB ab; Storage wird separat geprüft.
 */
export async function checkBackend(): Promise<HealthResult[]> {
  if (config.useMock) {
    return [
      { id: "api", label: "API", status: "unknown", hint: "Mock-Modus — kein Backend konfiguriert", detail: "VITE_API_URL setzen, um zu verbinden." },
      { id: "db", label: "Datenbank", status: "unknown", hint: "Nur im API-Modus prüfbar" },
      { id: "storage", label: "Object Storage", status: "unknown", hint: "Nur im API-Modus prüfbar" },
      { id: "ai", label: "KI-Provider", status: "unknown", hint: "Server-seitig — per Feature-Flag freigeschaltet" },
    ];
  }

  const base = config.apiBaseUrl;
  const health = await ping(`${base}/health`);

  // /health liefert { ok, ts } — DB ist erreichbar, wenn der Endpoint antwortet.
  const results: HealthResult[] = [
    {
      id: "api",
      label: "API",
      status: health.ok ? "ok" : "down",
      hint: health.ok ? `Erreichbar (${health.ms} ms)` : `Nicht erreichbar (HTTP ${health.status ?? "—"})`,
      latencyMs: health.ms,
      detail: base,
    },
    {
      id: "db",
      label: "Datenbank",
      status: health.ok ? "ok" : "down",
      hint: health.ok ? "Über /health gemeldet" : "Kein Antwort vom API-Server",
    },
  ];

  // Storage: Presign-Endpoint als Verfügbarkeitsindikator (ohne echten Upload).
  const storage = await ping(`${base}/upload/presign`, 2000).catch(() => ({ ok: false, ms: 0 }));
  results.push({
    id: "storage",
    label: "Object Storage",
    status: storage.ok ? "ok" : "unknown",
    hint: storage.ok ? "Presign-Endpoint antwortet" : "Presign nicht erreichbar (evtl. nicht implementiert)",
    latencyMs: storage.ms,
  });

  results.push({
    id: "ai",
    label: "KI-Provider",
    status: "unknown",
    hint: "Key liegt serverseitig — hier nur per Feature-Flag steuerbar",
  });

  return results;
}

/** Umgebungs-/System-Infos für das Dev-Panel (nur Client-Daten, keine Secrets). */
export function systemInfo() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  return {
    mode: config.useMock ? "Mock" : "API",
    apiBaseUrl: config.apiBaseUrl || "—",
    pwaInstalled: isStandalone ? "ja" : "nein",
    online: typeof navigator !== "undefined" ? (navigator.onLine ? "ja" : "nein") : "—",
    viewport: typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "—",
    dpr: typeof window !== "undefined" ? String(window.devicePixelRatio) : "—",
    platform: /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "macOS" : /Win/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "—",
    languages: typeof navigator !== "undefined" ? (navigator.languages?.join(", ") || navigator.language) : "—",
    storage: typeof navigator !== "undefined" && "storage" in navigator ? "verfügbar" : "—",
  };
}
