import { describe, expect, it } from "vitest";
import { memberActivityTarget } from "@/lib/member-activity";

describe("memberActivityTarget (B-92)", () => {
  it("Threads und Kommentare öffnen den Thread, Wiki den Artikel", () => {
    expect(memberActivityTarget({ kind: "thread", targetId: "t1" })).toEqual({ view: "forum", params: { threadId: "t1" } });
    expect(memberActivityTarget({ kind: "comment", targetId: "t2" })).toEqual({ view: "forum", params: { threadId: "t2" } });
    expect(memberActivityTarget({ kind: "wiki", targetId: "w1" })).toEqual({ view: "wiki", params: { articleId: "w1" } });
  });
});
