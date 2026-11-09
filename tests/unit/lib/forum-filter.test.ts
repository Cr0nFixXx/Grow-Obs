import { describe, expect, it } from "vitest";
import { NO_FILTERS, activeFilterCount, filterThreads, sortComments, threadTags } from "@/lib/forum-filter";
import type { ForumComment, ForumThreadBrief } from "@/services/interfaces";

const NOW = Date.parse("2026-10-01T15:00:00");
const H = 3_600_000;
const thread = (id: string, over: Partial<ForumThreadBrief> = {}): ForumThreadBrief => ({
  id, title: `Thread ${id}`, sub: "r/Anbau", author: "alice", avatar: "", votes: 0, comments: 0, ago: "", excerpt: "Text", tag: "Diskussion",
  createdAt: new Date(NOW - 2 * H).toISOString(), ...over,
});

describe("filterThreads (B-93)", () => {
  const list = [
    thread("a", { createdAt: new Date(NOW - 1 * H).toISOString(), mine: true, comments: 0, tag: "Frage", title: "Düngung in der Blüte" }),
    thread("b", { createdAt: new Date(NOW - 3 * 24 * H).toISOString(), comments: 4, tag: "Diskussion", author: "Bob" }),
    thread("c", { createdAt: new Date(NOW - 20 * 24 * H).toISOString(), comments: 0, tag: "Frage", excerpt: "Schimmel am Stamm" }),
    thread("d", { createdAt: new Date(NOW - 60 * 24 * H).toISOString(), comments: 1, tag: "Showcase" }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => filterThreads(list, { ...NO_FILTERS, ...f }, NOW).map((t) => t.id);

  it("ohne Filter bleibt alles", () => expect(ids({})).toEqual(["a", "b", "c", "d"]));
  it("Zeitraum Heute / Woche / Monat", () => {
    expect(ids({ range: "today" })).toEqual(["a"]);
    expect(ids({ range: "week" })).toEqual(["a", "b"]);
    expect(ids({ range: "month" })).toEqual(["a", "b", "c"]);
  });
  it("Nur meine und Ohne Antworten", () => {
    expect(ids({ mine: true })).toEqual(["a"]);
    expect(ids({ unanswered: true })).toEqual(["a", "c"]);
  });
  it("Tag-Filter", () => expect(ids({ tag: "Frage" })).toEqual(["a", "c"]));
  it("Suche in Titel, Text, Autor – ohne Groß-/Kleinschreibung und Akzente", () => {
    expect(ids({ query: "dungung" })).toEqual(["a"]);
    expect(ids({ query: "SCHIMMEL" })).toEqual(["c"]);
    expect(ids({ query: "bob" })).toEqual(["b"]);
    expect(ids({ query: "gibtsnicht" })).toEqual([]);
  });
  it("Filter kombinieren sich (UND)", () => expect(ids({ tag: "Frage", range: "week", unanswered: true })).toEqual(["a"]));
  it("zählt aktive Filter; Leerzeichen in der Suche zählen nicht", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, query: "  " })).toBe(0);
    expect(activeFilterCount({ range: "week", mine: true, unanswered: true, query: "x", tag: "Frage" })).toBe(5);
  });
  it("Tags eindeutig und sortiert", () => expect(threadTags(list)).toEqual(["Diskussion", "Frage", "Showcase"]));
});

describe("sortComments (B-93)", () => {
  const c = (id: string, votes: number, minutesAgo: number, replies?: ForumComment[]): ForumComment => ({
    id, author: "x", avatar: "", body: id, votes, ago: "", createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(), replies,
  });
  const list = [c("alt", 5, 300, [c("r-alt", 0, 200), c("r-top", 9, 100)]), c("mitte", 1, 200), c("neu", 3, 10)];

  it("Älteste behält die Serverreihenfolge", () => expect(sortComments(list, "oldest").map((x) => x.id)).toEqual(["alt", "mitte", "neu"]));
  it("Neu: jüngster zuerst, auch in den Antworten", () => {
    const out = sortComments(list, "new");
    expect(out.map((x) => x.id)).toEqual(["neu", "mitte", "alt"]);
    expect(out[2]!.replies!.map((x) => x.id)).toEqual(["r-top", "r-alt"]);
  });
  it("Top: meiste Stimmen zuerst, auch in den Antworten", () => {
    const out = sortComments(list, "top");
    expect(out.map((x) => x.id)).toEqual(["alt", "neu", "mitte"]);
    expect(out[0]!.replies!.map((x) => x.id)).toEqual(["r-top", "r-alt"]);
  });
  it("verändert die Eingabe nicht", () => {
    sortComments(list, "top");
    expect(list.map((x) => x.id)).toEqual(["alt", "mitte", "neu"]);
  });
});
