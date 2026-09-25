import { describe, expect, it } from "vitest";
import { mockServices as svc } from "./mock";

/** Schnellaktionen: Mock-Services müssen neue Einträge für die Session wirklich speichern. */
describe("mock create flows", () => {
  it("persists a new grow and its log entry", async () => {
    const grow = await svc.grows.create({ name: "Test Run", strain: "Test Kush", breeder: "QA", medium: "Erde (Bio)" });
    expect((await svc.grows.list())[0].id).toBe(grow.id);
    await svc.grows.addLog(grow.id, { day: 0, date: "2026-01-01", title: "Gegossen", text: "", tag: "Gießen" });
    expect((await svc.grows.get(grow.id))?.logs[0].title).toBe("Gegossen");
    await expect(svc.grows.addLog("missing", { day: 0, date: "", title: "x", text: "", tag: "Gießen" })).rejects.toThrow();
  });

  it("adds a strain to the collection", async () => {
    const s = await svc.strains.create({ name: "QA Haze", breeder: "QA", type: "Sativa", thc: 21, cbd: 0.3, flowering: 10, yield: "500 g", difficulty: 2, price: 25, notes: "", effects: [] });
    expect((await svc.strains.list()).some((x) => x.id === s.id && x.color === "info")).toBe(true);
  });

  it("creates and toggles a task", async () => {
    const t = await svc.tasks.create({ title: "pH messen", grow: "Allgemein", when: "Heute", prio: "hoch" });
    expect(t.done).toBe(false);
    expect((await svc.tasks.toggle(t.id)).done).toBe(true);
    expect((await svc.tasks.list()).find((x) => x.id === t.id)?.done).toBe(true);
  });

  it("publishes a wiki draft that can be opened", async () => {
    const a = await svc.wiki.create({ title: "QA Artikel", category: "Licht", excerpt: "", body: ["Absatz eins.", "Absatz zwei."], tags: [] });
    expect(a.version).toBe("0.1");
    expect((await svc.wiki.get(a.id))?.body).toHaveLength(2);
  });

  it("adds grow photos, chat images and toggles the strain collection", async () => {
    const [grow] = await svc.grows.list();
    const updated = await svc.grows.addPhoto(grow.id, "blob:test/photo");
    expect(updated.gallery.at(-1)).toBe("blob:test/photo");

    const [conversation] = await svc.chat.listConversations();
    await svc.chat.sendMessage(conversation.id, "", "blob:test/chat");
    expect((await svc.chat.getMessages(conversation.id)).at(-1)).toMatchObject({ image: "blob:test/chat", from: "me" });

    const [strain] = await svc.strains.catalog();
    const before = (await svc.strains.collection()).some((s) => s.id === strain.id);
    expect(await svc.strains.toggleCollect(strain.id)).toBe(!before);
    expect((await svc.strains.collection()).some((s) => s.id === strain.id)).toBe(!before);
  });

  it("votes, un-votes and replies in the forum; comments on posts and hall entries", async () => {
    const [thread] = await svc.forum.listThreads();
    const base = thread.votes;
    expect(await svc.forum.vote(thread.id, 1)).toEqual({ votes: base + 1, myVote: 1 });
    expect(await svc.forum.vote(thread.id, -1)).toEqual({ votes: base - 1, myVote: -1 });
    expect(await svc.forum.vote(thread.id, 0)).toEqual({ votes: base, myVote: 0 });

    const root = await svc.forum.addComment(thread.id, "Wurzel");
    await svc.forum.addComment(thread.id, "Antwort", root.id);
    const detail = await svc.forum.getThread(thread.id);
    expect(detail?.commentsList.find((c) => c.id === root.id)?.replies?.[0].body).toBe("Antwort");
    expect((await svc.forum.voteComment(root.id, 1)).myVote).toBe(1);

    await svc.comments.add("hall", "h1", "Top!");
    expect(await svc.comments.list("hall", "h1")).toHaveLength(1);
    expect(await svc.comments.list("post", "h1")).toHaveLength(0);
  });

  it("publishes and removes release notes, newest first", async () => {
    const r = await svc.releases.create({ version: "9.9.9", title: "Test-Release", notes: ["Neu"], severity: "optional", features: ["forum"] });
    expect((await svc.releases.list())[0].id).toBe(r.id);
    await svc.releases.remove(r.id);
    expect((await svc.releases.list()).some((x) => x.id === r.id)).toBe(false);
  });
});
