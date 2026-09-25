import { describe, expect, it } from "vitest";
import { computeUpdate, parsePrefs, unseenReleases, updateAction, type Release } from "./update-logic";

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
