import type { ViewKey, NavParams } from "@/lib/nav";
import type { NotificationItem } from "@/types";

/** Wohin führt ein Klick auf eine Benachrichtigung? (Typ-basiert; später optional pro Eintrag ein Ziel.) */
export function notificationTarget(n: Pick<NotificationItem, "type">): { view: ViewKey; params?: NavParams } {
  switch (n.type) {
    case "grow": return { view: "grows" };
    case "task": return { view: "dashboard" };
    case "forum": return { view: "forum" };
    case "shop": return { view: "marketplace" };
    case "ai": return { view: "ai" };
    default: return { view: "notifications" };
  }
}
