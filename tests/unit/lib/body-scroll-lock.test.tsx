// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/lib/hooks";

afterEach(() => vi.restoreAllMocks());

describe("useBodyScrollLock (B-90)", () => {
  it("stellt die Scrollposition ohne weiches Scrollen wieder her (sonst springt die Seite nach oben und gleitet zurück)", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { value: scrollTo, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-420px");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "auto" });
  });
});
