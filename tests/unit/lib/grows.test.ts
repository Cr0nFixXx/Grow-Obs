import { describe, expect, it } from "vitest";
import { dryRatio, formatDay, formatGrams, isActiveGrow, conditionLabel, GROW_PHASE_NAMES } from "@/lib/grows";
import { parseGrams } from "@/components/GrowDialogs";

describe("Grow-Hilfen (B-84)", () => {
  it("zählt nur laufende, nicht archivierte Grows als aktiv", () => {
    expect(isActiveGrow({ status: "active", archived: false })).toBe(true);
    expect(isActiveGrow({ status: "active", archived: true })).toBe(false);
    expect(isActiveGrow({ status: "harvested", archived: false })).toBe(false);
    expect(isActiveGrow({ status: "aborted", archived: false })).toBe(false);
  });

  it("formatiert Datum und Gewicht ohne Zeitzonen-Verschiebung", () => {
    expect(formatDay("2026-10-24")).toBe("24.10.2026");
    expect(formatDay("2026-10-24T23:30:00.000Z")).toBe("24.10.2026");
    expect(formatDay(null)).toBe("–");
    expect(formatGrams(null)).toBe("–");
    expect(formatGrams(1250)).toBe("1.250 g");
    expect(formatGrams(0)).toBe("0 g");
  });

  it("berechnet das Verhältnis Trocken- zu Nassgewicht", () => {
    expect(dryRatio(400, 100)).toBe(25);
    expect(dryRatio(null, 100)).toBeNull();
    expect(dryRatio(0, 0)).toBeNull();
  });

  it("kennt fünf Phasen in fester Reihenfolge und drei Zustände", () => {
    expect([...GROW_PHASE_NAMES]).toEqual(["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"]);
    expect(Object.values(conditionLabel)).toEqual(["Gesund", "Beobachten", "Problem"]);
  });

  it("liest Gramm tolerant: leer = null, Komma, Rundung, Unsinn = NaN", () => {
    expect(parseGrams("")).toBeNull();
    expect(parseGrams("  ")).toBeNull();
    expect(parseGrams("450")).toBe(450);
    expect(parseGrams("12,6")).toBe(13);
    expect(parseGrams("abc")).toBeNaN();
    expect(parseGrams("-5")).toBeNaN();
  });
});
