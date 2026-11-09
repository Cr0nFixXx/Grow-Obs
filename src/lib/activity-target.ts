import type { NavParams, ViewKey } from "@/lib/nav";
import { notificationTarget } from "@/lib/notification-target";
import type { ActivityItem } from "@/types";

/** Wohin führt ein Klick auf einen Aktivitäts-Eintrag der Startseite (B-90)? Echte Einträge tragen die Art der Benachrichtigung, Demo-Einträge nur ein Symbol. */
export function activityTarget(a: Pick<ActivityItem, "type" | "icon">): { view: ViewKey; params?: NavParams } {
  if (a.type) return notificationTarget({ type: a.type as Parameters<typeof notificationTarget>[0]["type"] });
  switch (a.icon) {
    case "Sprout": case "NotebookPen": return { view: "grows" };
    case "BookOpen": case "GitFork": return { view: "wiki" };
    case "Scale": return { view: "planner" };
    case "MessagesSquare": return { view: "forum" };
    case "ShoppingBag": return { view: "marketplace" };
    case "Sparkles": return { view: "ai" };
    default: return { view: "notifications" };
  }
}
