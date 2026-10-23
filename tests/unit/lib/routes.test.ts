import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type { ViewKey } from "@/lib/nav";
import { isLinkable, parseLegacyQuery, parsePath, pathFor, shareUrl } from "@/lib/routes";

const ALL_VIEWS: Exclude<ViewKey, "notFound">[] = ["dashboard", "grows", "strains", "ai", "planner", "breeders", "marketplace", "wiki", "forum", "hallOfFame", "social", "communities", "showcase", "calculator", "consumption", "simulation", "report", "chat", "notifications", "profile", "member", "telegram", "auth", "devAdmin", "create"];

describe("pathFor / parsePath", () => {
  it("bildet jede verlinkbare Ansicht verlustfrei ab (Hin- und Rückweg)", () => {
    for (const view of ALL_VIEWS.filter(isLinkable)) {
      expect(parsePath(pathFor(view))).toEqual({ view, params: null });
    }
  });
  it("kennt Detail-IDs und Profil-Tabs", () => {
    expect(pathFor("grows", { growId: "g-1" })).toBe("/grows/g-1");
    expect(parsePath("/grows/g-1")).toEqual({ view: "grows", params: { growId: "g-1" } });
    expect(parsePath("/forum/abc")).toEqual({ view: "forum", params: { threadId: "abc" } });
    expect(parsePath("/wiki/w1")).toEqual({ view: "wiki", params: { articleId: "w1" } });
    expect(parsePath("/breeders/b1")).toEqual({ view: "breeders", params: { breederId: "b1" } });
    expect(parsePath("/strains/s1")).toEqual({ view: "strains", params: { strainId: "s1" } });
    expect(pathFor("strains", { strainId: "s1" })).toBe("/strains/s1");
    expect(parsePath("/communities/c1")).toEqual({ view: "communities", params: { id: "c1" } });
    expect(parsePath("/profile/settings")).toEqual({ view: "profile", params: { tab: "settings" } });
    expect(pathFor("profile", { tab: "settings" })).toBe("/profile/settings");
    expect(pathFor("hallOfFame")).toBe("/hall-of-fame");
  });
  it("Mitgliedsprofil liegt unter /u/<handle>; unsichere Benutzernamen werden abgelehnt", () => {
    expect(pathFor("member", { handle: "max_grows" })).toBe("/u/max_grows");
    expect(parsePath("/u/max_grows")).toEqual({ view: "member", params: { handle: "max_grows" } });
    expect(parsePath("/u/<script>")).toBeNull();
    expect(parsePath("/u/a/b")).toBeNull();
    expect(pathFor("member", { handle: "../etc" })).toBe("/u");
  });
  it("Anmeldung, Dev-Admin und Erstellen-Assistent haben keine URL (→ „/“)", () => {
    for (const view of ["auth", "devAdmin", "create"] as ViewKey[]) {
      expect(isLinkable(view)).toBe(false);
      expect(pathFor(view, { kind: "grow" })).toBe("/");
    }
    expect(parsePath("/auth")).toBeNull();
    expect(parsePath("/dev-admin")).toBeNull();
    expect(parsePath("/create")).toBeNull();
  });
  it("lehnt unbekannte, zu tiefe und unsichere Pfade ab", () => {
    expect(parsePath("/nope")).toBeNull();
    expect(parsePath("/grows/a/b")).toBeNull();
    expect(parsePath("/grows/<script>")).toBeNull();
    expect(parsePath("/grows/..%2f..")).toBeNull();
    expect(parsePath("/profile/hacker")).toBeNull();
    expect(parsePath("/strains/<b>")).toBeNull();
    expect(parsePath("/strains/x/y")).toBeNull();
    expect(pathFor("grows", { growId: "../etc" })).toBe("/grows");
    expect(pathFor("profile", { tab: "x" })).toBe("/profile");
  });
  it("toleriert Schrägstriche am Ende", () => {
    expect(parsePath("/grows/")).toEqual({ view: "grows", params: null });
    expect(parsePath("//")).toEqual({ view: "dashboard", params: null });
  });
});

describe("Legacy- und Teilen-Links", () => {
  it("liest alte ?view=-Links nur für verlinkbare Ansichten", () => {
    expect(parseLegacyQuery("?view=social")).toBe("social");
    expect(parseLegacyQuery("?view=devAdmin")).toBeNull();
    expect(parseLegacyQuery("?view=unsinn")).toBeNull();
    expect(parseLegacyQuery("")).toBeNull();
  });
  it("erzeugt Pfad-Links (Next) bzw. ?view=-Links (Legacy)", () => {
    expect(shareUrl("https://x.test", "forum", { threadId: "t1" }, true)).toBe("https://x.test/forum/t1");
    expect(shareUrl("https://x.test", "social", null, true, "#post-1")).toBe("https://x.test/social#post-1");
    expect(shareUrl("https://x.test", "forum", { threadId: "t1" }, false)).toBe("https://x.test/?view=forum");
  });
});

describe("Service-Worker-Liste", () => {
  it("enthält genau die Pfadsegmente der Ansichten", () => {
    const context: { GrowCachePolicy?: { appSegments: Set<string> } } = {};
    runInNewContext(readFileSync(new URL("../../../public/sw-policy.js", import.meta.url), "utf8"), context);
    const fromRoutes = new Set(ALL_VIEWS.filter((v) => isLinkable(v) && v !== "dashboard").map((v) => pathFor(v).slice(1)));
    expect([...context.GrowCachePolicy!.appSegments].sort()).toEqual([...fromRoutes].sort());
  });
});
