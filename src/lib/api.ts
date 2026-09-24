import { config } from "./config";

let authToken: string | null = null;

/** Auth-Token setzen (nach Login) bzw. entfernen (nach Logout). */
export function setAuthToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>({ method, path, body, signal }: RequestOptions): Promise<T> {
  // Tokens may only be sent to configured API paths, never a caller-supplied origin.
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new ApiError(0, "Ungueltiger API-Pfad");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });

    if (!res.ok) {
      const payload: unknown = await res.json().catch(() => null);
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error : `Anfrage fehlgeschlagen (HTTP ${res.status})`;
      throw new ApiError(res.status, message);
    }
    if (res.status === 204) return undefined as T;
    if (!res.headers.get("content-type")?.includes("json")) throw new ApiError(res.status, "Die API lieferte kein JSON. Bitte API-URL pruefen.");
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal?.aborted) throw err;
    throw new ApiError(0, controller.signal.aborted ? "Zeitlimit der Anfrage erreicht" : "API nicht erreichbar");
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Schlanker HTTP-Client für die API-Service-Implementierungen.
 * Hängt automatisch den Content-Type + ggf. das Bearer-Token an.
 */
export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>({ method: "GET", path, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>({ method: "POST", path, body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>({ method: "PUT", path, body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>({ method: "PATCH", path, body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) => request<T>({ method: "DELETE", path, signal }),
};
