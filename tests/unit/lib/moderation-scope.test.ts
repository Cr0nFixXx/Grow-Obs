import { describe, expect, it, vi } from "vitest";
import { isPlatformModerator, moderationFor } from "@/lib/moderation-scope";
import type { Services } from "@/services/interfaces";

const svc = () => ({
  communities: { report: vi.fn(async () => ({ duplicate: false })), setHidden: vi.fn(async () => undefined), reports: vi.fn(async () => ({ items: [], hasMore: false })), resolveReport: vi.fn(async () => undefined) },
  moderation: { report: vi.fn(async () => ({ duplicate: true })), setHidden: vi.fn(async () => undefined), queue: vi.fn(async () => ({ items: [], hasMore: true })), resolve: vi.fn(async () => undefined) },
});
const input = { kind: "post", targetId: "p", reason: "spam" } as never;

describe("moderationFor (B-89)", () => {
  it("mit Community-ID: nutzt die Community-Dienste", async () => {
    const s = svc();
    const m = moderationFor(s as unknown as Services, "c1");
    await m.report(input); await m.setHidden("post", "p", true); await m.queue("open", 20); await m.resolve("post", "p", "hide");
    expect(s.communities.report).toHaveBeenCalledWith("c1", input);
    expect(s.communities.setHidden).toHaveBeenCalledWith("c1", "post", "p", true);
    expect(s.communities.reports).toHaveBeenCalledWith("c1", "open", 20);
    expect(s.communities.resolveReport).toHaveBeenCalledWith("c1", "post", "p", "hide");
    expect(s.moderation.report).not.toHaveBeenCalled();
  });
  it("ohne Community (null): nutzt die Plattform-Moderation", async () => {
    const s = svc();
    const m = moderationFor(s as unknown as Services, null);
    expect(await m.report(input)).toEqual({ duplicate: true });
    await m.setHidden("thread", "t", false); await m.queue("closed", 0); await m.resolve("forum_comment", "f", "dismiss");
    expect(s.moderation.setHidden).toHaveBeenCalledWith("thread", "t", false);
    expect(s.moderation.queue).toHaveBeenCalledWith("closed", 0);
    expect(s.moderation.resolve).toHaveBeenCalledWith("forum_comment", "f", "dismiss");
    expect(s.communities.report).not.toHaveBeenCalled();
  });
});

describe("isPlatformModerator", () => {
  it("Moderator, Admin und Betreiber ja; Mitglied und leer nein", () => {
    for (const r of ["moderator", "admin", "platform_admin"]) expect(isPlatformModerator(r)).toBe(true);
    for (const r of ["member", "", undefined, null]) expect(isPlatformModerator(r)).toBe(false);
  });
});
