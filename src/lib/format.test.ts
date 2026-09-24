import { describe, it, expect } from "vitest";
import { clamp, compact, eur, n, pct, timeAgo } from "./format";

describe("eur", () => {
  it("formats whole euros (de-DE)", () => {
    expect(eur(168)).toMatch(/168/);
    expect(eur(168)).toMatch(/€/);
  });
  it("formats decimals when requested", () => {
    expect(eur(12.5, true)).toMatch(/12,50/);
  });
  it("uses dot as thousands separator", () => {
    expect(eur(1234)).toMatch(/1\.234/);
  });
});

describe("n", () => {
  it("formats with de-DE thousands separators", () => {
    expect(n(1234567)).toBe("1.234.567");
  });
});

describe("compact", () => {
  it("compacts large numbers", () => {
    expect(compact(12400)).toMatch(/12/);
  });
});

describe("pct", () => {
  it("formats with German comma", () => {
    expect(pct(98)).toBe("98 %");
  });
  it("respects decimal places", () => {
    expect(pct(50, 1)).toBe("50,0 %");
  });
});

describe("clamp", () => {
  it("clamps below min", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("clamps above max", () => expect(clamp(15, 0, 10)).toBe(10));
  it("keeps value within range", () => expect(clamp(5, 0, 10)).toBe(5));
});

describe("timeAgo", () => {
  it("returns 'gerade eben' for the current moment", () => {
    expect(timeAgo(new Date())).toBe("gerade eben");
  });
  it("returns 'gestern' for one day ago", () => {
    const d = new Date(Date.now() - 1000 * 60 * 60 * 24);
    expect(timeAgo(d)).toBe("gestern");
  });
});
