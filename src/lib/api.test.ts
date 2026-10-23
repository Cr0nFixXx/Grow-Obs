// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, http, SESSION_EXPIRED_EVENT, setSessionHeaderToken } from "./api";

vi.mock("./config", () => ({ config: { apiBaseUrl: "https://api.example.test", useMock: false } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("HTTP privacy and error handling", () => {
  it("sends the HttpOnly session cookie, never an Authorization header, without browser cache or redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await http.get("/auth/me");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/auth/me", expect.objectContaining({
      cache: "no-store", credentials: "include", redirect: "error",
      headers: { Accept: "application/json" },
    }));
  });
  it("sends X-Session-Token only while a fallback token is set (proxy environments), never Authorization", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    setSessionHeaderToken("fallback-token");
    await http.get("/auth/me");
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ Accept: "application/json", "X-Session-Token": "fallback-token" });
    setSessionHeaderToken(null);
    await http.get("/auth/me");
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({ Accept: "application/json" });
  });
  it("announces an expired session on 401 of a data request, but not for wrong credentials", async () => {
    const seen = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, seen);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ error: "Unauthorized" }, { status: 401 }))));
    await expect(http.post("/auth/login", { email: "a@b.c", password: "x" })).rejects.toMatchObject({ status: 401 });
    await expect(http.post("/auth/register", {})).rejects.toMatchObject({ status: 401 });
    expect(seen).not.toHaveBeenCalled();
    await expect(http.get("/grows")).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, seen);
  });
  it("does not send the cookie to an arbitrary URL", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(http.get("https://other.test/steal")).rejects.toBeInstanceOf(ApiError);
    await expect(http.get("//other.test/steal")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps error status and a readable JSON message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Keine Berechtigung" }, { status: 403 })));
    await expect(http.get("/admin/users")).rejects.toMatchObject({ status: 403, message: "Keine Berechtigung" });
  });
  it("rejects an HTML SPA fallback instead of treating it as API data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>app</html>", { headers: { "Content-Type": "text/html" } })));
    await expect(http.get("/grows")).rejects.toMatchObject({ message: expect.stringContaining("kein JSON") });
  });
  it("handles 204 without attempting JSON parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(http.delete("/posts/1")).resolves.toBeUndefined();
  });
  it("times out a stalled fetch", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const result = expect(http.get("/admin/health")).rejects.toMatchObject({ status: 0, message: "Zeitlimit der Anfrage erreicht" });
    await vi.advanceTimersByTimeAsync(15000);
    await result;
  });
});
describe("Anfragen: Parallelität und Wiederholung (B-80)", () => {
  it("führt höchstens 4 Anfragen gleichzeitig aus und arbeitet den Rest nacheinander ab", async () => {
    let running = 0; let peak = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      running += 1; peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
      return Response.json({ ok: true });
    }));
    await Promise.all(Array.from({ length: 12 }, (_, i) => http.get(`/x/${i}`)));
    expect(peak).toBe(4);
  });
  it("wiederholt eine lesende Anfrage nach 500 einmal, nicht nach 403 und nicht beim Schreiben", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Interner Fehler" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(http.get("/grows")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const timeout = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "ausgelastet", code: "DB_TIMEOUT" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: 2 }));
    vi.stubGlobal("fetch", timeout);
    await expect(http.get("/grows")).resolves.toEqual({ ok: 2 });
    expect(timeout).toHaveBeenCalledTimes(2);

    const denied = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ error: "Feature aus", feature: "marketplace" }, { status: 403 })));
    vi.stubGlobal("fetch", denied);
    await expect(http.get("/offers")).rejects.toMatchObject({ status: 403 });
    expect(denied).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ error: "Interner Fehler" }, { status: 500 })));
    vi.stubGlobal("fetch", failing);
    await expect(http.post("/chat/1/messages", {})).rejects.toMatchObject({ status: 500 });
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
