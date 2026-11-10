import { describe, expect, it } from "vitest";
import { bannerVisible, computeUpdate, parsePrefs, unseenReleases, updateAction, type Release } from "@/lib/update-logic";

const rel = (id: string, publishedAt: string, severity: Release["severity"] = "recommended"): Release =>
  ({ id, version: id, title: id, notes: ["x"], severity, features: [], publishedAt });

describe("update detection (B-50)", () => {
  const base = { clientBuild: "a1", clientBuiltAt: "2026-09-01T00:00:00Z", releases: [] as Release[] };
  it("reports an update only when the server runs a different build", () => {
    expect(computeUpdate({ ...base, serverBuild: "a1" }).available).toBe(false);
    expect(computeUpdate({ ...base, serverBuild: "b2" }).available).toBe(true);
    expect(computeUpdate({ ...base, serverBuild: null }).available).toBe(false);
    expect(computeUpdate({ ...base, clientBuild: "dev", serverBuild: "b2" }).available).toBe(false);
  });
  it("forces the update only for required releases published after the client build", () => {
    const old = rel("old", "2026-08-01T00:00:00Z", "required");
    const fresh = rel("new", "2026-09-10T00:00:00Z", "required");
    expect(computeUpdate({ ...base, serverBuild: "b2", releases: [old] }).mandatory).toBe(false);
    expect(computeUpdate({ ...base, serverBuild: "b2", releases: [fresh] })).toMatchObject({ mandatory: true, requiredRelease: fresh });
    expect(computeUpdate({ ...base, serverBuild: "a1", releases: [fresh] }).mandatory).toBe(false); // bereits aktuell
  });
});

describe("what's new + preferences", () => {
  const list = [rel("r1", "2026-09-01T00:00:00Z"), rel("r2", "2026-09-05T00:00:00Z"), rel("r3", "2026-09-09T00:00:00Z")];
  it("shows only releases newer than the last seen one, newest first; nothing on first start", () => {
    expect(unseenReleases(list, "2026-09-04T00:00:00Z").map((r) => r.id)).toEqual(["r3", "r2"]);
    expect(unseenReleases(list, null)).toEqual([]);
  });
  it("sanitises stored preferences", () => {
    expect(parsePrefs({ mode: "auto", showWhatsNew: false })).toEqual({ mode: "auto", showWhatsNew: false });
    expect(parsePrefs({ mode: "yolo" })).toEqual({ mode: "prompt", showWhatsNew: true });
    expect(parsePrefs(null).mode).toBe("prompt");
  });
  it("auto-applies only when safe (app hidden or just started)", () => {
    expect(updateAction("auto", { visible: false, justStarted: false })).toBe("apply");
    expect(updateAction("auto", { visible: true, justStarted: true })).toBe("apply");
    expect(updateAction("auto", { visible: true, justStarted: false })).toBe("badge");
    expect(updateAction("prompt", { visible: true, justStarted: false })).toBe("banner");
    expect(updateAction("manual", { visible: false, justStarted: true })).toBe("badge");
  });
});

describe("Pull-to-Refresh und Updates (B-80)", () => {
  it("installiert nur im Modus „Automatisch“ ohne Rückfrage", async () => {
    const { pullRefreshUpdate } = await import("@/lib/update-logic");
    expect(pullRefreshUpdate("auto", true)).toBe("apply");
    expect(pullRefreshUpdate("prompt", true)).toBe("notice");
    expect(pullRefreshUpdate("manual", true)).toBe("notice");
    expect(pullRefreshUpdate("auto", false)).toBe("none");
    expect(pullRefreshUpdate("prompt", false)).toBe("none");
  });
});

describe("Update-Banner und „Was ist neu“ (B-104)", () => {
  const base = { available: true, mandatory: false, mode: "prompt" as const, snoozed: false, whatsNewOpen: false, settling: false };
  it("zeigt das Banner nur im Modus „Nachfragen“ bei verfügbarem Update", () => {
    expect(bannerVisible(base)).toBe(true);
    expect(bannerVisible({ ...base, available: false })).toBe(false);
    expect(bannerVisible({ ...base, mode: "auto" })).toBe(false);
    expect(bannerVisible({ ...base, mode: "manual" })).toBe(false);
    expect(bannerVisible({ ...base, snoozed: true })).toBe(false);
    expect(bannerVisible({ ...base, mandatory: true })).toBe(false);
  });
  it("bleibt weg, solange „Was ist neu“ offen ist und kurz danach", () => {
    expect(bannerVisible({ ...base, whatsNewOpen: true })).toBe(false);
    expect(bannerVisible({ ...base, settling: true })).toBe(false);
  });
});
