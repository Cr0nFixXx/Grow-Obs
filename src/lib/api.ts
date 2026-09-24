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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Netzwerkfehler");
  }

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
