import { describe, expect, it } from "vitest";
import { bottomZoneHeight, canScrollToward, isTabSwipe, lockAxis, pageSwipeAction, shouldDismiss } from "./gestures";
import { toggleCompareId } from "@/data/compare";

const scroller = (pos: { top?: number; left?: number }, size = { h: 1000, w: 1000 }, client = { h: 400, w: 400 }) =>
  ({ scrollTop: pos.top ?? 0, scrollLeft: pos.left ?? 0, scrollHeight: size.h, scrollWidth: size.w, clientHeight: client.h, clientWidth: client.w }) as unknown as HTMLElement;

describe("gesture decisions", () => {
  it("locks the dominant axis only after the slop", () => {
    expect(lockAxis(3, 4)).toBeNull();
    expect(lockAxis(20, 5)).toBe("x");
    expect(lockAxis(-4, 18)).toBe("y");
  });

  it("dismisses on distance or on a fast flick, but not on a tiny fast twitch", () => {
    expect(shouldDismiss(100, 0, 88)).toBe(true);
    expect(shouldDismiss(40, 0.9, 88)).toBe(true);
    expect(shouldDismiss(8, 2, 88)).toBe(false);
    expect(shouldDismiss(60, 0.1, 88)).toBe(false);
  });

  it("hands a sheet drag over only when the content is scrolled to the top", () => {
    // Finger nach unten (+y): Inhalt würde Richtung Anfang scrollen.
    expect(canScrollToward(scroller({ top: 120 }), "y", 1)).toBe(true);
    expect(canScrollToward(scroller({ top: 0 }), "y", 1)).toBe(false);
    // Drawer links schließen (Finger nach links, -x): horizontaler Scroller am Ende gibt ab.
    expect(canScrollToward(scroller({ left: 600 }), "x", -1)).toBe(false);
    expect(canScrollToward(scroller({ left: 100 }), "x", -1)).toBe(true);
  });

  it("recognises tab swipes only for clear, quick horizontal moves", () => {
    expect(isTabSwipe(-120, 10, 250)).toBe("next");
    expect(isTabSwipe(110, -20, 300)).toBe("prev");
    expect(isTabSwipe(-50, 0, 200)).toBeNull(); // zu kurz
    expect(isTabSwipe(-120, 90, 250)).toBeNull(); // zu diagonal (Scrollen)
    expect(isTabSwipe(-150, 0, 1200)).toBeNull(); // zu langsam (Lesen/Ziehen)
  });
});

describe("strain compare selection", () => {
  it("adds up to the max, removes existing, and reports a full selection", () => {
    expect(toggleCompareId([], "a")).toEqual({ next: ["a"], full: false });
    expect(toggleCompareId(["a", "b"], "a")).toEqual({ next: ["b"], full: false });
    expect(toggleCompareId(["a", "b", "c"], "d")).toEqual({ next: ["a", "b", "c"], full: true });
  });
});

describe("page swipe zones (B-48)", () => {
  const H = 800; // Viewport-Höhe → untere Zone ab 560 px (30 %)
  it("switches bottom-nav tabs only in the lower zone", () => {
    expect(bottomZoneHeight(H)).toBe(240);
    expect(pageSwipeAction(700, H, -120, 5, 250)).toBe("next");
    expect(pageSwipeAction(700, H, 120, 5, 250)).toBe("prev");
  });
  it("goes back on a right swipe in the middle zone, ignores left swipes there", () => {
    expect(pageSwipeAction(300, H, 120, 5, 250)).toBe("back");
    expect(pageSwipeAction(300, H, -120, 5, 250)).toBeNull();
  });
  it("ignores slow, short or diagonal moves everywhere", () => {
    expect(pageSwipeAction(300, H, 120, 90, 250)).toBeNull();
    expect(pageSwipeAction(700, H, -40, 0, 200)).toBeNull();
    expect(pageSwipeAction(700, H, -140, 0, 1400)).toBeNull();
  });
});
