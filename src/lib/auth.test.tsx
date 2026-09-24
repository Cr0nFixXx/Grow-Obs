// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { ApiError } from "./api";
import { sessionKey } from "./session-storage";
import type { User } from "@/types";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), token: vi.fn() }));
vi.mock("./config", () => ({ config: { useMock: false, apiBaseUrl: "https://api.example.test" } }));
vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return { ...actual, http: { get: mocks.get, post: mocks.post }, setAuthToken: mocks.token };
});
const user: User = { id: "u1", name: "Member", handle: "member", avatar: "", role: "member", level: 99, title: "Grow Master", grows: 0, harvests: 0, followers: 0, telegram: false };
function Probe() {
  const auth = useAuth();
  return <div><span>{auth.loading ? "loading" : "ready"}</span><span>{auth.user?.id ?? "anonymous"}</span>{auth.sessionError && <p role="alert">{auth.sessionError}</p>}<button onClick={auth.logout}>logout</button></div>;
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);
describe("session restore", () => {
  it("does not consider a restored token to be an authenticated user until verified", async () => {
    localStorage.setItem(sessionKey, "stored");
    let complete!: (user: User) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.getByText("anonymous")).toBeTruthy();
    await act(async () => complete(user));
    expect(screen.getByText("u1")).toBeTruthy();
  });
  it("does not resurrect a logged-out session after a late restore response", async () => {
    localStorage.setItem(sessionKey, "stored");
    let complete!: (user: User) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByText("logout"));
    await act(async () => complete(user));
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });
  it("keeps an offline token for retry but never unlocks protected content", async () => {
    localStorage.setItem(sessionKey, "stored");
    mocks.get.mockRejectedValue(new ApiError(0, "Offline"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("anonymous")).toBeTruthy();
    expect(localStorage.getItem(sessionKey)).toBe("stored");
  });
});