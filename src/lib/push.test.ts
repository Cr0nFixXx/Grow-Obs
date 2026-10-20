// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), install: vi.fn(() => "manual") }));
vi.mock("@/lib/api", () => ({ http: { get: mocks.get, post: mocks.post } }));
vi.mock("@/lib/pwa", () => ({ getInstallState: mocks.install }));

import { disablePush, enablePush, localSubscription, pushNavigationTarget, PushError, pushSupport, syncPushSubscription, urlBase64ToUint8Array } from "./push";

type Sub = { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> };
const makeSub = (endpoint = "https://fcm.googleapis.com/fcm/send/x"): Sub => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "P", auth: "A" } }), unsubscribe: vi.fn().mockResolvedValue(true) });

let current: Sub | null;
let permission: NotificationPermission;
const subscribe = vi.fn();
function stubBrowser() {
  const reg = { pushManager: { getSubscription: vi.fn(async () => current), subscribe } };
  subscribe.mockImplementation(async () => (current = makeSub()));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn(async () => reg), register: vi.fn(async () => reg), ready: Promise.resolve(reg) } });
  vi.stubGlobal("PushManager", class {});
  const N = vi.fn();
  Object.defineProperty(N, "permission", { get: () => permission });
  Object.assign(N, { requestPermission: vi.fn(async () => { permission = "granted"; return permission; }) });
  vi.stubGlobal("Notification", N);
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: (globalThis as { Notification: unknown }).Notification });
}
beforeEach(() => { vi.clearAllMocks(); current = null; permission = "default"; mocks.install.mockReturnValue("manual"); stubBrowser(); });
afterEach(() => { vi.unstubAllGlobals(); delete (window as { PushManager?: unknown }).PushManager; delete (window as { Notification?: unknown }).Notification; });

describe("Push im Browser", () => {
  it("erkennt Unterstützung, fehlende API und iOS ohne Installation", () => {
    expect(pushSupport()).toBe("ok");
    mocks.install.mockReturnValue("ios");
    expect(pushSupport()).toBe("needs-install");
    mocks.install.mockReturnValue("installed");
    delete (window as { PushManager?: unknown }).PushManager;
    expect(pushSupport()).toBe("unsupported");
  });

  it("wandelt den VAPID-Schlüssel (base64url) in Bytes um", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([251, 255]);
  });

  it("aktivieren: fragt die Berechtigung, abonniert mit dem Server-Schlüssel und meldet das Abo (nur Endpunkt + Schlüssel) an", async () => {
    mocks.post.mockResolvedValue({ devices: [] });
    await enablePush("AQID");
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(mocks.post).toHaveBeenCalledWith("/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "P", auth: "A" } });
  });

  it("aktivieren: blockierte Berechtigung → verständlicher Fehler, kein Abo, kein Serveraufruf", async () => {
    permission = "denied";
    await expect(enablePush("AQID")).rejects.toMatchObject({ code: "denied" });
    expect(subscribe).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("aktivieren: ohne Browser-Unterstützung → PushError", async () => {
    mocks.install.mockReturnValue("ios");
    await expect(enablePush("AQID")).rejects.toBeInstanceOf(PushError);
  });

  it("deaktivieren: beendet das Browser-Abo und löscht den Server-Eintrag", async () => {
    current = makeSub();
    mocks.post.mockResolvedValue({ devices: [] });
    await disablePush();
    expect(current.unsubscribe).toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith("/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/x" });
  });

  it("Abgleich beim Start: nur mit Berechtigung und vorhandenem Abo, still und ohne Dialog", async () => {
    await syncPushSubscription();
    expect(mocks.post).not.toHaveBeenCalled(); // Berechtigung „default“
    permission = "granted";
    await syncPushSubscription();
    expect(mocks.post).not.toHaveBeenCalled(); // kein Abo
    current = makeSub();
    await syncPushSubscription();
    expect(mocks.post).toHaveBeenCalledWith("/push/subscribe", expect.objectContaining({ endpoint: current.endpoint }));
    expect(await localSubscription()).toBe(current);
  });

  it("Klick auf eine Meldung: nur Nachrichten des Service Workers mit App-Pfad werden akzeptiert", () => {
    expect(pushNavigationTarget({ type: "GO_NAVIGATE", url: "/chat" })).toBe("/chat");
    for (const bad of [null, "x", {}, { type: "GO_NAVIGATE" }, { type: "OTHER", url: "/chat" }, { type: "GO_NAVIGATE", url: "//evil.example" }, { type: "GO_NAVIGATE", url: "https://evil.example" }]) expect(pushNavigationTarget(bad)).toBeNull();
  });
});
