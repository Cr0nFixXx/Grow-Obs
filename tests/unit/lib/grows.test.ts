import { describe, expect, it } from "vitest";
import { VPD_BAND, formatRange, outsideRange, rangeAlerts, average, dayDiff, dryRatio, formatDay, formatGrams, isActiveGrow, conditionLabel, GROW_PHASE_NAMES, shiftDay, vpdKpa } from "@/lib/grows";
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

  it("VPD (B-85): Blatt = Luft minus Abzug, wie in der API", () => {
    expect(vpdKpa(25, 60)).toBe(0.91);
    expect(vpdKpa(25, 60, 0)).toBe(1.27);
    expect(vpdKpa(20, 100, 2)).toBe(0);
    expect(VPD_BAND).toEqual({ min: 0.8, max: 1.2 });
  });

  it("Datumshilfen und Mittelwert ignorieren leere Werte", () => {
    expect(dayDiff("2026-09-01", "2026-10-01")).toBe(30);
    expect(dayDiff("2026-10-01", "2026-09-01")).toBe(0);
    expect(dayDiff("kaputt", "2026-09-01")).toBe(0);
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(average([1, null, 2, undefined, 3])).toBe(2);
    expect(average([null])).toBeNull();
  });
});

describe("Zielbereiche (B-86)", () => {
  const targets = { ph: { min: 5.8, max: 6.5 }, ec: { min: 1, max: 2 } };
  const point = (date: string, over: Partial<{ ph: number | null; ec: number | null; vpd: number | null }> = {}) => ({ day: 1, date, temp: null, rh: null, vpd: null, ec: null, ph: null, ...over });

  it("outsideRange: Grenzen zählen als im Bereich; ohne Wert oder Bereich nie außerhalb", () => {
    expect(outsideRange(5.8, targets.ph)).toBeNull();
    expect(outsideRange(6.5, targets.ph)).toBeNull();
    expect(outsideRange(5.79, targets.ph)).toBe("low");
    expect(outsideRange(6.51, targets.ph)).toBe("high");
    expect(outsideRange(null, targets.ph)).toBeNull();
    expect(outsideRange(9, null)).toBeNull();
  });

  it("formatRange: deutsches Format mit optionaler Einheit", () => {
    expect(formatRange({ min: 5.8, max: 6.5 })).toBe("5,8–6,5");
    expect(formatRange({ min: 1, max: 2 }, "mS")).toBe("1–2 mS");
  });

  it("rangeAlerts: nur der jeweils letzte Wert zählt; Bereich aus = kein Hinweis; VPD nutzt das feste Band", () => {
    const env = [
      point("2026-10-01", { ph: 7.5, ec: 3 }), // alt, außerhalb – wird vom neueren überholt
      point("2026-10-02", { ph: 6.1, ec: 2.4, vpd: 1.5 }),
      point("2026-10-03", { ph: null, ec: null, vpd: null }), // leerer Tag ändert nichts
    ];
    const alerts = rangeAlerts(env, targets);
    expect(alerts.map((a) => [a.key, a.direction, a.date])).toEqual([["ec", "high", "2026-10-02"], ["vpd", "high", "2026-10-02"]]);
    expect(rangeAlerts(env, { ph: null, ec: null }).map((a) => a.key)).toEqual(["vpd"]);
    expect(rangeAlerts([], targets)).toEqual([]);
  });
});
