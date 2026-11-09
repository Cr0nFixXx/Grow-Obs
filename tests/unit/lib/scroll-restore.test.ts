// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreScroll, scrollToTopAfterUnlock } from "@/lib/hooks";

afterEach(() => { vi.restoreAllMocks(); document.documentElement.style.scrollBehavior = ""; });

describe("restoreScroll (B-96)", () => {
  it("springt sofort: CSS-Animation während des Aufrufs aus, danach wiederhergestellt", () => {
    document.documentElement.style.scrollBehavior = "smooth";
    let during = "";
    const spy = vi.fn(() => { during = document.documentElement.style.scrollBehavior; });
    window.scrollTo = spy as unknown as typeof window.scrollTo;
    restoreScroll(420);
    expect(spy).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "instant" });
    expect(during).toBe("auto");
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
  });
  it("scrollToTopAfterUnlock scrollt ohne Sperre sofort nach oben", () => {
    const spy = vi.fn();
    window.scrollTo = spy as unknown as typeof window.scrollTo;
    scrollToTopAfterUnlock();
    expect(spy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
});
