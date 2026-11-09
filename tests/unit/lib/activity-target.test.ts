import { describe, expect, it } from "vitest";
import { activityTarget } from "@/lib/activity-target";

describe("activityTarget (B-90)", () => {
  it("echte Einträge folgen der Art der Benachrichtigung", () => {
    expect(activityTarget({ type: "grow", icon: "Sprout" }).view).toBe("grows");
    expect(activityTarget({ type: "forum", icon: "Info" }).view).toBe("forum");
    expect(activityTarget({ type: "shop", icon: "Info" }).view).toBe("marketplace");
    expect(activityTarget({ type: "system", icon: "Info" }).view).toBe("notifications");
  });
  it("Demo-Einträge ohne Art folgen dem Symbol, unbekannt → Benachrichtigungen", () => {
    expect(activityTarget({ icon: "NotebookPen" }).view).toBe("grows");
    expect(activityTarget({ icon: "BookOpen" }).view).toBe("wiki");
    expect(activityTarget({ icon: "Scale" }).view).toBe("planner");
    expect(activityTarget({ icon: "Unbekannt" }).view).toBe("notifications");
  });
});
