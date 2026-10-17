// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { ApiError, SESSION_EXPIRED_EVENT } from "./api";
import { sessionKey } from "./session-storage";
import type { User } from "@/types";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./config", () => ({ config: { useMock: false, apiBaseUrl: "https://api.example.test" } }));
vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return { ...actual, http: { get: mocks.get, post: mocks.post } };
});
const user: User = { id: "u1", name: "Member", handle: "member", avatar: "", role: "member", level: 99, title: "Grow Master", grows: 0, harvests: 0, followers: 0, telegram: false };
function Probe() {
  const auth = useAuth();
  return <div><span>{auth.loading ? "loading" : "ready"}</span><span>{auth.user?.id ?? "anonymous"}</span>{auth.sessionError && <p role="alert">{auth.sessionError}</p>}<button onClick={auth.logout}>logout</button></div>;
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); mocks.post.mockResolvedValue(undefined); });
afterEach(cleanup);
describe("session restore", () => {
  it("does not consider a restored session marker to be an authenticated user until verified", async () => {
    localStorage.setItem(sessionKey, "1");
    let complete!: (user: User) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.getByText("anonymous")).toBeTruthy();
    await act(async () => complete(user));
    expect(screen.getByText("u1")).toBeTruthy();
  });
  it("does not resurrect a logged-out session after a late restore response", async () => {
    localStorage.setItem(sessionKey, "1");
    let complete!: (user: User) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByText("logout"));
    await act(async () => complete(user));
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
  it("keeps the marker offline for retry but never unlocks protected content", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockRejectedValue(new ApiError(0, "Offline"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBe("1");
  });
});
function Actions() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.loading ? "loading" : "ready"}</span><span>{auth.user?.id ?? "anonymous"}</span>
      <button onClick={() => void auth.login("a@b.c", "pw", true)}>login</button>
      <button onClick={() => void auth.login("a@b.c", "pw", false)}>login-short</button>
      <button onClick={auth.logout}>logout</button>
      <button onClick={() => void auth.logoutAll()}>logout-all</button>
    </div>
  );
}

describe("HttpOnly-Cookie-Sitzung (B-54)", () => {
  it("speichert nach dem Login nur den Marker, nie ein Token", async () => {
    mocks.post.mockResolvedValue({ user });
    render(<AuthProvider><Actions /></AuthProvider>);
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledWith("/auth/login", { email: "a@b.c", password: "pw", remember: true });
    expect(localStorage.getItem(sessionKey)).toBe("1");
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/eyJ|token/i);
  });
  it("ohne „Angemeldet bleiben“ liegt der Marker nur im sessionStorage", async () => {
    mocks.post.mockResolvedValue({ user });
    render(<AuthProvider><Actions /></AuthProvider>);
    fireEvent.click(screen.getByText("login-short"));
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledWith("/auth/login", expect.objectContaining({ remember: false }));
    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(sessionStorage.getItem(sessionKey)).toBe("1");
  });
  it("Logout meldet sofort lokal ab und beendet die Sitzung auf dem Server", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockResolvedValue(user);
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    fireEvent.click(screen.getByText("logout"));
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith("/auth/logout");
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
  it("Logout klappt auch, wenn der Server nicht erreichbar ist", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockResolvedValue(user);
    mocks.post.mockRejectedValue(new ApiError(0, "offline"));
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    fireEvent.click(screen.getByText("logout"));
    expect(screen.getByText("anonymous")).toBeTruthy();
  });
  it("„Alle Geräte abmelden“ ruft den Server und meldet danach lokal ab", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockResolvedValue(user);
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    fireEvent.click(screen.getByText("logout-all"));
    await waitFor(() => expect(screen.getByText("anonymous")).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledWith("/auth/logout-all");
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
  it("meldet lokal ab, wenn der Server die Sitzung beendet hat (401-Ereignis), ohne erneut /auth/logout aufzurufen", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockResolvedValue(user);
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("u1")).toBeTruthy());
    act(() => { window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT)); });
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("ein 401 beim Wiederherstellen entfernt den Marker (Sitzung abgelaufen)", async () => {
    localStorage.setItem(sessionKey, "1");
    mocks.get.mockRejectedValue(new ApiError(401, "Unauthorized"));
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
  it("ein altes Bearer-JWT im Speicher wird nicht als Sitzung gewertet und gelöscht", async () => {
    localStorage.setItem(sessionKey, "eyJhbGciOiJIUzI1NiJ9.alt.token");
    render(<AuthProvider><Actions /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(mocks.get).not.toHaveBeenCalled();
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
});
