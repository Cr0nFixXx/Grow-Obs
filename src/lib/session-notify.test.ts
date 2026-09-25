import { beforeEach, describe, expect, it } from "vitest";
import { readSessionToken, sessionKey, writeSessionToken } from "./session-storage";
import { notificationTarget } from "./notification-target";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe("remember me (B-48)", () => {
  beforeEach(() => {
    Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
  });
  it("persists in localStorage when remembered", () => {
    writeSessionToken("t1", true);
    expect(localStorage.getItem(sessionKey)).toBe("t1");
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
    expect(readSessionToken()).toBe("t1");
  });
  it("keeps the token only for the browser session otherwise and clears the other store", () => {
    writeSessionToken("old", true);
    writeSessionToken("t2", false);
    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(sessionStorage.getItem(sessionKey)).toBe("t2");
    expect(readSessionToken()).toBe("t2");
    writeSessionToken(null);
    expect(readSessionToken()).toBeNull();
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
