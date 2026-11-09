import { describe, expect, it } from "vitest";
import { sortThreads } from "@/lib/forum-sort";
import type { ForumThreadBrief } from "@/services/interfaces";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const t = (id: string, votes: number, comments: number, h: number): ForumThreadBrief => ({
  id, title: id, sub: "r/DIY", author: "A", avatar: "", votes, comments, ago: "", excerpt: "", tag: "", createdAt: hoursAgo(h),
});
// Fall aus dem Fehlerbericht: alter Beitrag mit 4 Kommentaren, neuer mit 1 Like.
const old = t("alt", 0, 4, 48);
const fresh = t("neu", 1, 0, 2);
const mid = t("mitte", 3, 1, 24);

describe("Forum-Sortierung (B-90)", () => {
  it("Neu: jüngster zuerst, unabhängig von Stimmen und Kommentaren", () => {
    expect(sortThreads([old, mid, fresh], "new", NOW).map((x) => x.id)).toEqual(["neu", "mitte", "alt"]);
  });
  it("Top: meiste Stimmen zuerst, Gleichstand nach Kommentaren", () => {
    expect(sortThreads([old, fresh, mid], "top", NOW).map((x) => x.id)).toEqual(["mitte", "neu", "alt"]);
    expect(sortThreads([t("a", 2, 0, 1), t("b", 2, 5, 9)], "top", NOW).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("Heiß unterscheidet sich von Top: Aktivität mit Zeitabfall, alter Beitrag sinkt", () => {
    const hot = sortThreads([old, fresh, mid], "hot", NOW).map((x) => x.id);
    const top = sortThreads([old, fresh, mid], "top", NOW).map((x) => x.id);
    expect(hot).not.toEqual(top);
    expect(hot[0]).toBe("neu");
    expect(hot[hot.length - 1]).toBe("alt");
  });
  it("ohne Zeitstempel (Demo) gilt die Listenreihenfolge als Alter", () => {
    const a = { ...t("a", 0, 0, 0), createdAt: undefined };
    const b = { ...t("b", 0, 0, 0), createdAt: undefined };
    expect(sortThreads([a, b], "new", NOW).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("verändert die Eingabe nicht", () => {
    const input = [old, fresh];
    sortThreads(input, "top", NOW);
    expect(input.map((x) => x.id)).toEqual(["alt", "neu"]);
  });
});
