// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBodyScrollLock, useLongPress } from "./hooks";

beforeEach(() => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 240 });
  window.scrollTo = vi.fn();
  document.body.removeAttribute("style");
  delete document.body.dataset.scrollLock;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("touch overlay infrastructure", () => {
  it("keeps the page locked until the last stacked overlay closes", () => {
    const first = renderHook(() => useBodyScrollLock(true));
    const second = renderHook(() => useBodyScrollLock(true));
    expect(document.body.dataset.scrollLock).toBe("true");
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    first.unmount();
    expect(document.body.dataset.scrollLock).toBe("true");
    second.unmount();
    expect(document.body.dataset.scrollLock).toBeUndefined();
    expect(document.body.style.position).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it("cancels long-press when the pointer turns into a scroll gesture", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    function Target() {
      const { handlers } = useLongPress(callback, 480);
      return <button {...handlers}>target</button>;
    }
    const { getByRole } = render(<Target />);
    const target = getByRole("button");
    fireEvent.pointerDown(target, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(target, { pointerType: "touch", clientX: 21, clientY: 40 });
    vi.advanceTimersByTime(600);
    expect(callback).not.toHaveBeenCalled();
  });

  it("fires a stationary long-press once", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    function Target() {
      const { handlers } = useLongPress(callback, 480);
      return <button {...handlers}>target</button>;
    }
    const { getByRole } = render(<Target />);
    fireEvent.pointerDown(getByRole("button"), { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});