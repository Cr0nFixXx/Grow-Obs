import type { NavParams, ViewKey } from "@/lib/nav";
import type { MemberActivityItem } from "@/types";

/** Wohin ein Eintrag der Profil-Aktivität führt: Thread (auch bei Kommentaren) bzw. Wiki-Artikel. */
export function memberActivityTarget(item: Pick<MemberActivityItem, "kind" | "targetId">): { view: ViewKey; params: NavParams } {
  return item.kind === "wiki"
    ? { view: "wiki", params: { articleId: item.targetId } }
    : { view: "forum", params: { threadId: item.targetId } };
}
