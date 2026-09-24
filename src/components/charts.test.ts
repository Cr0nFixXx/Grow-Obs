import { describe, it, expect } from "vitest";
import { smooth } from "./charts";

describe("smooth (path builder)", () => {
  it("returns empty string for empty input", () => {
    expect(smooth([])).toBe("");
  });

  it("returns a single move command for one point", () => {
    expect(smooth([{ x: 0, y: 0 }])).toBe("M 0 0");
  });

  it("starts with a move and contains a cubic curve for multiple points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ];
    const d = smooth(pts);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain(" C ");
    // one fewer curve segments than points
    expect((d.match(/ C /g) || []).length).toBe(pts.length - 1);
  });

  it("handles two points", () => {
    const d = smooth([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain(" C ");
  });
});
