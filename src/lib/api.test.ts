import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, http, setAuthToken } from "./api";

vi.mock("./config", () => ({ config: { apiBaseUrl: "https://api.example.test", useMock: false } }));
afterEach(() => { setAuthToken(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("HTTP privacy and error handling", () => {
  it("sends bearer requests without browser cache, cookies or redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    setAuthToken("test-token");
    await http.get("/auth/me");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/auth/me", expect.objectContaining({
      cache: "no-store", credentials: "omit", redirect: "error",
      headers: { Accept: "application/json", Authorization: "Bearer test-token" },
    }));
  });
  it("does not send the token to an arbitrary URL", async () => {
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