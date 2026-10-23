import { beforeEach, describe, expect, it } from "vitest";
import { readSessionMarker, sessionKey, writeSessionMarker } from "@/lib/session-storage";
import { notificationTarget } from "@/lib/notification-target";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe("remember me (B-48, ab B-54 nur ein nicht geheimer Marker)", () => {
  beforeEach(() => {
    Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
  });
  it("persists the marker in localStorage when remembered", () => {
    writeSessionMarker(true, true);
    expect(localStorage.getItem(sessionKey)).toBe("1");
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
    expect(readSessionMarker()).toBe(true);
  });
  it("keeps the marker only for the browser session otherwise and clears the other store", () => {
    writeSessionMarker(true, true);
    writeSessionMarker(true, false);
    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(sessionStorage.getItem(sessionKey)).toBe("1");
    expect(readSessionMarker()).toBe(true);
    writeSessionMarker(false);
    expect(readSessionMarker()).toBe(false);
  });
  it("purges a legacy bearer JWT instead of treating it as a session", () => {
    localStorage.setItem(sessionKey, "eyJhbGciOiJIUzI1NiJ9.legacy.token");
    sessionStorage.setItem(sessionKey, "eyJhbGciOiJIUzI1NiJ9.other.token");
    expect(readSessionMarker()).toBe(false);
    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
  });
});

describe("notification targets (B-48)", () => {
  it("routes each notification type to its view", () => {
    expect(notificationTarget({ type: "forum" }).view).toBe("forum");
    expect(notificationTarget({ type: "grow" }).view).toBe("grows");
    expect(notificationTarget({ type: "shop" }).view).toBe("marketplace");
    expect(notificationTarget({ type: "task" }).view).toBe("dashboard");
    expect(notificationTarget({ type: "system" }).view).toBe("notifications");
  });
});
