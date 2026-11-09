import { describe, expect, it } from "vitest";
import { mockServices as svc } from "@/services/mock";

/** Mock-Modus (B-61): gleiche Regeln wie die API – Feed je Community, Ausblenden, Meldungen, Rauswurf/Sperre. */
describe("mock Community-Moderation", () => {
  it("Community-Feed ist getrennt vom globalen Feed; Ausblenden entfernt ihn für Mitglieder (Moderator sieht ihn)", async () => {
    const post = await svc.social.createPost({ text: "Nur für die Crew", communityId: "co-3" });
    expect(post.communityId).toBe("co-3");
    expect((await svc.social.listPosts()).some((p) => p.id === post.id)).toBe(false);
    expect((await svc.social.listPosts("co-3")).map((p) => p.id)).toContain(post.id);
    await svc.communities.setHidden("co-3", "post", post.id, true);
    // Mock-Nutzer ist in co-3 Admin → sieht ausgeblendete Beiträge markiert
    expect((await svc.social.listPosts("co-3")).find((p) => p.id === post.id)?.hidden).toBe(true);
    await svc.communities.setHidden("co-3", "post", post.id, false);
    expect((await svc.social.listPosts("co-3")).find((p) => p.id === post.id)?.hidden).toBeUndefined();
  });

  it("Meldung: doppelt = duplicate, Warteschlange, Entscheidung hide blendet aus und schließt die Meldung", async () => {
    const post = await svc.social.createPost({ text: "Spam!", communityId: "co-3" });
    expect(await svc.communities.report("co-3", { kind: "post", targetId: post.id, reason: "spam" })).toEqual({ duplicate: false });
    expect(await svc.communities.report("co-3", { kind: "post", targetId: post.id, reason: "spam" })).toEqual({ duplicate: true });
    const open = (await svc.communities.reports("co-3", "open")).items;
    const group = open.find((g) => g.targetId === post.id)!;
    expect(group).toMatchObject({ kind: "post", count: 1, preview: { text: "Spam!" } });
    expect((await svc.communities.get("co-3"))?.openReports).toBeGreaterThanOrEqual(1);
    await svc.communities.resolveReport("co-3", "post", post.id, "hide");
    expect((await svc.communities.reports("co-3", "open")).items.some((g) => g.targetId === post.id)).toBe(false);
    expect((await svc.communities.reports("co-3", "closed")).items.find((g) => g.targetId === post.id)?.status).toBe("hidden");
    expect((await svc.social.listPosts("co-3")).find((p) => p.id === post.id)?.hidden).toBe(true);
    await expect(svc.communities.resolveReport("co-3", "post", post.id, "hide")).rejects.toThrow("Keine offene Meldung");
  });

  it("Rauswurf: Moderator entfernbar durch Admin; Admin nie; mit Sperre erscheint die Person in der Sperrliste und kann entsperrt werden", async () => {
    const before = (await svc.communities.get("co-3"))!;
    const mod = before.membersList.find((m) => m.role === "moderator")!;
    const admin = before.membersList.find((m) => m.role === "admin")!;
    await expect(svc.communities.kick("co-3", admin.id, false)).rejects.toThrow("Admins");
    await svc.communities.kick("co-3", mod.id, true);
    const after = (await svc.communities.get("co-3"))!;
    expect(after.membersList.some((m) => m.id === mod.id)).toBe(false);
    expect(after.members).toBe(before.members - 1);
    expect((await svc.communities.bans("co-3")).map((b) => b.id)).toContain(mod.id);
    await svc.communities.unban("co-3", mod.id);
    expect((await svc.communities.bans("co-3")).map((b) => b.id)).not.toContain(mod.id);
  });
});
