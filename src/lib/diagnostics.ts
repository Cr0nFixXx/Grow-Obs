import { config } from "./config";
import { ApiError, http } from "./api";
import type { AdminService, SystemHealth } from "@/services/interfaces";

export interface HealthResult {
  id: string;
  label: string;
  status: "ok" | "down" | "unknown";
  hint: string;
  latencyMs?: number;
  detail?: string;
}

const labels = { api: "API", db: "Datenbank", storage: "Object Storage", ai: "KI-Provider" } as const;

/** Never infer database/storage health from an HTTP liveness response. */
export function healthRows(report: SystemHealth): HealthResult[] {
  return (Object.keys(labels) as Array<keyof typeof labels>).map((id) => {
    const service = report.services?.[id];
    const status = report.mode === "mock" || !service ? "unknown" : service.status ?? (service.ok ? "ok" : "unknown");
    return { id, label: labels[id], status, hint: service?.hint ?? "Nicht geprüft", latencyMs: service?.latencyMs ?? undefined };
  });
}

export async function checkBackend(admin: Pick<AdminService, "health">): Promise<HealthResult[]> {
  return healthRows(await admin.health());
}

export const diagnosticPaths = ["/health", "/admin/health", "/admin/stats"] as const;
export type DiagnosticPath = typeof diagnosticPaths[number];

/** Only known read-only paths, using the authenticated client. No arbitrary URL with tokens. */
export async function runDiagnostic(path: string, admin: AdminService): Promise<string> {
  if (!diagnosticPaths.includes(path as DiagnosticPath)) throw new Error("Diagnosepfad nicht erlaubt");
  const start = performance.now();
  try {
    const response = config.useMock
      ? path === "/admin/health" ? await admin.health() : path === "/admin/stats" ? await admin.stats() : { mode: "mock", status: "unknown", message: "Kein Server geprüft" }
      : await http.get<unknown>(path);
    return `${config.useMock ? "Demo" : "HTTP 200"} / ${Math.round(performance.now() - start)} ms\n\n${JSON.stringify(response, null, 2).slice(0, 5000)}`;
  } catch (error) {
    if (error instanceof ApiError) return `HTTP ${error.status || "nicht erreichbar"}\n${error.message}`;
    throw error;
  }
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
