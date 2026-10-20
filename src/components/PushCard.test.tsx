// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushState } from "@/lib/push";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), del: vi.fn(), toast: vi.fn(), useMock: { value: false }, feature: { value: true },
  support: vi.fn(() => "ok"), local: vi.fn(async () => null as unknown), enable: vi.fn(), disable: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ config: { get useMock() { return mocks.useMock.value; }, apiBaseUrl: "" } }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), http: { get: mocks.get, put: mocks.put, post: mocks.post, delete: mocks.del } }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.toast }) }));
vi.mock("@/config/FeatureContext", () => ({ useFeatures: () => ({ isEnabled: () => mocks.feature.value }) }));
vi.mock("@/lib/push", async (original) => ({
  ...(await original<typeof import("@/lib/push")>()),
  pushSupport: mocks.support, localSubscription: mocks.local, enablePush: mocks.enable, disablePush: mocks.disable, notificationPermission: () => "default",
}));
import { PushCard } from "./PushCard";

const state = (over: Partial<PushState> = {}): PushState => ({
  configured: true, devices: [],
  prefs: { messages: true, community: true, grows: true, other: true, showPreview: false, quietEnabled: false, quietStart: "22:00", quietEnd: "07:00", timezone: "Europe/Berlin" }, ...over,
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.useMock.value = false; mocks.feature.value = true; mocks.support.mockReturnValue("ok"); mocks.local.mockResolvedValue(null);
  mocks.get.mockImplementation(async (path: string) => (path === "/push/config" ? { configured: true, publicKey: "KEY" } : state()));
});
afterEach(cleanup);

describe("PushCard", () => {
  it("Demo-Modus: ehrlicher Hinweis statt wirkungslosem Schalter, keine Serveraufrufe", () => {
    mocks.useMock.value = true;
    render(<PushCard />);
    expect(screen.getByTestId("push-card").textContent).toMatch(/Demo-Modus nicht verfügbar/);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("Feature `push` aus: nichts anzeigen", () => {
    mocks.feature.value = false;
    const { container } = render(<PushCard />);
    expect(container.innerHTML).toBe("");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("Server ohne VAPID-Schlüssel: sagt das ehrlich, keine Einstellungen", async () => {
    mocks.get.mockImplementation(async (path: string) => (path === "/push/config" ? { configured: false, publicKey: null } : state({ configured: false })));
    render(<PushCard />);
    expect((await screen.findByTestId("push-not-configured")).textContent).toMatch(/nicht eingerichtet/);
    expect(screen.queryByTestId("push-prefs")).toBeNull();
  });

  it("iOS im Safari-Tab: Installationshinweis statt Schalter", async () => {
    mocks.support.mockReturnValue("needs-install");
    render(<PushCard />);
    expect((await screen.findByTestId("push-needs-install")).textContent).toMatch(/Zum Home-Bildschirm/);
    expect(screen.queryByRole("switch", { name: "Auf diesem Gerät aktivieren" })).toBeNull();
  });

  it("Gerät aktivieren: ruft enablePush mit dem Server-Schlüssel und übernimmt den neuen Stand", async () => {
    mocks.enable.mockResolvedValue(state({ devices: [{ id: "d1", device: "Chrome auf Windows", createdAt: "2026-10-20T10:00:00Z", current: true }] }));
    render(<PushCard />);
    const toggle = await screen.findByRole("switch", { name: "Auf diesem Gerät aktivieren" });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith("KEY"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Push aktiviert" })));
  });

  it("Fehler beim Aktivieren (z. B. Berechtigung blockiert) wird angezeigt", async () => {
    const { PushError } = await import("@/lib/push");
    mocks.enable.mockRejectedValue(new PushError("denied", "Benachrichtigungen sind im Browser blockiert."));
    render(<PushCard />);
    fireEvent.click(await screen.findByRole("switch", { name: "Auf diesem Gerät aktivieren" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nicht aktiviert", desc: expect.stringMatching(/blockiert/) })));
  });

  it("Kategorie, Vorschau und Ruhezeit speichern Teiländerungen (Ruhezeit mit der Zeitzone des Browsers)", async () => {
    mocks.put.mockImplementation(async (_p: string, patch: object) => state({ prefs: { ...state().prefs, ...patch } }));
    render(<PushCard />);
    fireEvent.click(await screen.findByRole("switch", { name: "Community & Forum" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/push/prefs", { community: false }));
    fireEvent.click(screen.getByRole("switch", { name: "Vorschau anzeigen" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/push/prefs", { showPreview: true }));
    fireEvent.click(screen.getByRole("switch", { name: "Ruhezeit" }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/push/prefs", { quietEnabled: true, timezone: expect.any(String) }));
    const from = await screen.findByLabelText("Ruhezeit von");
    fireEvent.change(from, { target: { value: "23:30" } });
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/push/prefs", { quietStart: "23:30" }));
  });

  it("Test-Meldung gibt es nur auf einem aktiven Gerät", async () => {
    render(<PushCard />);
    await screen.findByTestId("push-prefs");
    expect(screen.queryByRole("button", { name: /Test-Meldung/ })).toBeNull();
    cleanup();
    mocks.local.mockResolvedValue({ endpoint: "x" });
    mocks.get.mockImplementation(async (path: string) => (path === "/push/config" ? { configured: true, publicKey: "KEY" } : state({ devices: [{ id: "d1", device: "Chrome", createdAt: "2026-10-20T10:00:00Z", current: true }] })));
    mocks.post.mockResolvedValue({ sent: 1 });
    render(<PushCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Test-Meldung/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/push/test"));
  });
});
