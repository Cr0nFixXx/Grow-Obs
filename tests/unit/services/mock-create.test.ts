import { describe, expect, it } from "vitest";
import { mockServices as svc } from "@/services/mock";

/** Schnellaktionen: Mock-Services müssen neue Einträge für die Session wirklich speichern. */
describe("mock create flows", () => {
  it("persists a new grow and its log entry", async () => {
    const grow = await svc.grows.create({ name: "Test Run", strain: "Test Kush", breeder: "QA", medium: "Erde (Bio)" });
    expect((await svc.grows.list())[0].id).toBe(grow.id);
    await svc.grows.addLog(grow.id, { title: "Gegossen", text: "", tag: "Gießen" });
    expect((await svc.grows.get(grow.id))?.logs[0].title).toBe("Gegossen");
    await expect(svc.grows.addLog("missing", { title: "x", text: "", tag: "Gießen" })).rejects.toThrow();
  });

  it("grow lifecycle: Phase, Ernte, Wiederaufnahme, Archiv, Löschen (B-84)", async () => {
    const grow = await svc.grows.create({ name: "Zyklus", strain: "QA Kush", breeder: "", medium: "Erde (Bio)", startDate: "2026-01-01" });
    expect(grow).toMatchObject({ status: "active", condition: "gesund", archived: false, phase: "Keimung" });
    expect(grow.day).toBeGreaterThan(0);
    const veg = await svc.grows.setPhase(grow.id, "Vegetativ");
    expect(veg.phases.find((p) => p.active)?.label).toBe("Vegetativ");
    await expect(svc.grows.setPhase(grow.id, "Quatsch")).rejects.toThrow();
    const harvested = await svc.grows.finish(grow.id, { outcome: "harvested", date: "2026-04-01", wetG: 300, dryG: 70, note: "ok" });
    expect(harvested).toMatchObject({ status: "harvested", progress: 100, endedOn: "2026-04-01", harvest: { wetG: 300, dryG: 70, note: "ok" } });
    await expect(svc.grows.setPhase(grow.id, "Blüte")).rejects.toThrow();
    const aborted = await svc.grows.finish(grow.id, { outcome: "aborted" });
    expect(aborted.harvest).toMatchObject({ wetG: null, dryG: null });
    expect((await svc.grows.reopen(grow.id))).toMatchObject({ status: "active", endedOn: null, harvest: null });
    expect((await svc.grows.archive(grow.id, true)).archived).toBe(true);
    expect((await svc.grows.update(grow.id, { condition: "problem", name: "Neu" }))).toMatchObject({ condition: "problem", name: "Neu" });
    await svc.grows.remove(grow.id);
    expect(await svc.grows.get(grow.id)).toBeUndefined();
    await svc.grows.remove(grow.id);
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
    expect(updated.photos.at(-1)?.url).toBe("blob:test/photo");

    const [conversation] = await svc.chat.listConversations();
    await svc.chat.sendMessage(conversation.id, "", [
      { path: "blob:test/chat", kind: "image", name: "", size: 1, mime: "image/png" },
      { path: "blob:test/doc", kind: "file", name: "Plan.pdf", size: 2, mime: "application/pdf" },
    ]);
    expect((await svc.chat.getMessages(conversation.id)).at(-1)).toMatchObject({ image: "blob:test/chat", from: "me", attachments: [{ kind: "image" }, { kind: "file", name: "Plan.pdf" }] });

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

  it("deletes own chat messages for everyone and keeps a placeholder", async () => {
    const sent = await svc.chat.sendMessage("cv-del", "Zum Löschen", [{ path: "blob:x", kind: "file", name: "a.pdf", size: 1, mime: "application/pdf" }]);
    await svc.chat.deleteMessage("cv-del", sent.id);
    const [m] = await svc.chat.getMessages("cv-del");
    expect(m).toMatchObject({ id: sent.id, text: "", deleted: true, attachments: [] });
    await expect(svc.chat.deleteMessage("cv-del", "gibt-es-nicht")).rejects.toThrow();
  });

  it("Tagebuch (B-85): Logs mit Datum, bearbeiten, löschen; Messwerte je Tag; VPD aus Blatt-Abzug; Fotos verwalten", async () => {
    const grow = await svc.grows.create({ name: "Tagebuch", strain: "QA", breeder: "", medium: "Erde (Bio)", startDate: "2026-01-01" });
    const log = await svc.grows.addLog(grow.id, { title: " Früh ", text: "", tag: "Gießen", date: "2026-01-11" });
    expect(log).toMatchObject({ title: "Früh", date: "2026-01-11", day: 10 });
    await expect(svc.grows.addLog(grow.id, { title: "x", text: "", tag: "Gießen", date: "2025-12-31" })).rejects.toThrow();
    await expect(svc.grows.addLog(grow.id, { title: "x", text: "", tag: "Gießen", date: "2999-01-01" })).rejects.toThrow();
    const newer = await svc.grows.addLog(grow.id, { title: "Neuer", text: "", tag: "Dünger", date: "2026-01-20" });
    expect((await svc.grows.get(grow.id))?.logs.map((l) => l.id)).toEqual([newer.id, log.id]);
    expect(await svc.grows.updateLog(grow.id, log.id, { date: "2026-01-30", title: "Spät" })).toMatchObject({ date: "2026-01-30", day: 29, title: "Spät" });
    expect((await svc.grows.get(grow.id))?.logs[0]?.id).toBe(log.id);
    await svc.grows.deleteLog(grow.id, log.id);
    expect((await svc.grows.get(grow.id))?.logs).toHaveLength(1);

    expect(await svc.grows.saveEnv(grow.id, { date: "2026-01-05", temp: 25, rh: 60, ph: 6.2 })).toMatchObject({ day: 4, vpd: 0.91, ec: null, ph: 6.2 });
    expect(await svc.grows.saveEnv(grow.id, { date: "2026-01-05", ph: 6.5 })).toMatchObject({ temp: null, vpd: null, ph: 6.5 }); // ersetzt den Tag
    await svc.grows.saveEnv(grow.id, { date: "2026-01-04", temp: 25, rh: 60 });
    await expect(svc.grows.saveEnv(grow.id, { date: "2026-01-06" })).rejects.toThrow();
    const env = (await svc.grows.get(grow.id))!.env;
    expect(env.map((e) => e.date)).toEqual(["2026-01-04", "2026-01-05"]);
    const after = await svc.grows.update(grow.id, { leafOffset: 0 });
    expect(after.env[0]?.vpd).toBe(1.27);
    await svc.grows.deleteEnv(grow.id, "2026-01-04");
    expect((await svc.grows.get(grow.id))!.env).toHaveLength(1);

    await svc.grows.addPhoto(grow.id, "blob:a");
    const two = await svc.grows.addPhoto(grow.id, "blob:b");
    expect(two.cover).toBe("blob:a");
    const [a, b] = two.photos as [(typeof two.photos)[number], (typeof two.photos)[number]];
    const moved = await svc.grows.updatePhoto(grow.id, b.id, { cover: true, caption: "  Blüte " });
    expect(moved.cover).toBe("blob:b");
    expect(moved.photos.find((p) => p.id === b.id)).toMatchObject({ caption: "Blüte", cover: true });
    const rest = await svc.grows.deletePhoto(grow.id, b.id);
    expect(rest.photos.map((p) => p.id)).toEqual([a.id]);
    expect(rest.cover).toBe("blob:a");
    expect((await svc.grows.deletePhoto(grow.id, a.id)).cover).toBe("");
  });

  it("mehrere Sorten: anlegen, bearbeiten, Ernte-Gewichte je Sorte mit Summe (B-100)", async () => {
    const e = (name: string, breeder = "", plants: number | null = null) => ({ name, breeder, plants, wetG: null, dryG: null });
    const grow = await svc.grows.create({ name: "Mix", medium: "Erde (Bio)", strains: [e("A", "X", 2), e("B")] });
    expect(grow.strains.map((x) => x.name)).toEqual(["A", "B"]);
    expect(grow).toMatchObject({ strain: "A, B", breeder: "X" });
    const edited = await svc.grows.update(grow.id, { strains: [e("A", "X", 2), e("B"), e("C")] });
    expect(edited.strain).toBe("A, B, C");
    const done = await svc.grows.finish(grow.id, { outcome: "harvested", strainWeights: [{ wetG: 100, dryG: 20 }, { wetG: 50, dryG: null }, { wetG: null, dryG: null }] });
    expect(done.harvest).toMatchObject({ wetG: 150, dryG: 20 });
    expect(done.strains.map((x) => x.wetG)).toEqual([100, 50, null]);
    await expect(svc.grows.finish(grow.id, { outcome: "harvested", strainWeights: [{ wetG: 1, dryG: 1 }] })).rejects.toThrow();
    const aborted = await svc.grows.finish(grow.id, { outcome: "aborted" });
    expect(aborted.strains.every((x) => x.wetG === null)).toBe(true);
  });
  it("Anlegen mit Sichtbarkeit; ohne Angabe privat, ohne Sorte erlaubt (B-102)", async () => {
    const plain = await svc.grows.create({ name: "Wizard ohne Sorte", medium: "Erde (Bio)" });
    expect(plain.visibility).toBe("private");
    expect(plain.strains).toEqual([]);
    const shared = await svc.grows.create({ name: "Wizard geteilt", medium: "Erde (Bio)", visibility: "community" });
    expect(shared.visibility).toBe("community");
  });
  it("Sorten je Eintrag, Foto und pH/EC; Entfernen löst die Zuordnung (B-101)", async () => {
    const e = (name: string) => ({ name, breeder: "", plants: null, wetG: null, dryG: null });
    const grow = await svc.grows.create({ name: "Mix2", medium: "Erde (Bio)", strains: [e("A"), e("B"), e("C")] });
    const [a, b, c] = grow.strains.map((x) => x.id!) as [string, string, string];
    expect(new Set([a, b, c]).size).toBe(3);
    const log = await svc.grows.addLog(grow.id, { title: "Gießen", text: "", tag: "Gießen", strainIds: [a, b] });
    expect(log.strainIds).toEqual([a, b]);
    await expect(svc.grows.addLog(grow.id, { title: "x", text: "", tag: "Gießen", strainIds: ["nope"] })).rejects.toThrow("Unbekannte Sorte");
    const photo = (await svc.grows.addPhoto(grow.id, "blob:x", [a])).photos[0]!;
    expect(photo.strainIds).toEqual([a]);
    const retagged = await svc.grows.updatePhoto(grow.id, photo.id, { strainIds: [b, c] });
    expect(retagged.photos[0]!.strainIds).toEqual([b, c]);
    const today = (await svc.grows.get(grow.id))!.startDate;
    await svc.grows.saveEnv(grow.id, { date: today, ph: 6, strainEnv: [{ strainId: a, ph: 5.5, ec: 1.5 }, { strainId: b, ph: 6.5 }] });
    let now = (await svc.grows.get(grow.id))!;
    expect(now.env).toHaveLength(1);
    expect(now.strainEnv).toHaveLength(2);
    await svc.grows.saveEnv(grow.id, { date: today, ph: 6, strainEnv: [{ strainId: b, ph: 6.5 }] });
    expect((await svc.grows.get(grow.id))!.strainEnv).toHaveLength(1);
    await svc.grows.saveEnv(grow.id, { date: today, ph: 6, strainEnv: [{ strainId: a, ph: 5.5, ec: 1.5 }, { strainId: b, ph: 6.5 }] });
    // A entfernen: Eintrag/Foto verlieren A, pH vorhanden → bleibt, EC wird übernommen
    await svc.grows.update(grow.id, { strains: [{ ...e("B"), id: b }, { ...e("C"), id: c }] });
    now = (await svc.grows.get(grow.id))!;
    expect(now.logs.find((l) => l.id === log.id)!.strainIds).toEqual([b]);
    expect(now.photos[0]!.strainIds).toEqual([b, c]);
    expect(now.env[0]).toMatchObject({ ph: 6, ec: 1.5 });
    expect(now.strainEnv!.map((x) => x.strainId)).toEqual([b]);
    await svc.grows.deleteEnv(grow.id, today);
    now = (await svc.grows.get(grow.id))!;
    expect(now.env).toHaveLength(0);
    expect(now.strainEnv).toHaveLength(0);
  });
});
