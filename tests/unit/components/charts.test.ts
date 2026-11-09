import { describe, it, expect } from "vitest";
import { smooth } from "@/components/charts";

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

  it("überschwingt nie: Kontrollpunkte bleiben zwischen den Datenwerten (B-86)", () => {
    // Plateau und Spitze: Catmull-Rom würde hier unter 0 bzw. über 10 schwingen.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 }];
    const d = smooth(pts);
    const ys = [...d.matchAll(/C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4])]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
  });

  it("verbindet Punkte mit gleichem x gerade statt NaN zu erzeugen", () => {
    expect(smooth([{ x: 5, y: 1 }, { x: 5, y: 4 }, { x: 9, y: 2 }])).not.toContain("NaN");
  });
});
