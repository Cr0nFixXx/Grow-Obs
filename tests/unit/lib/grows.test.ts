import { describe, expect, it } from "vitest";
import { PHASE_TARGETS, TARGET_KEYS, effectiveTargets, phaseAtDate, targetSteps, targetsOn, formatRange, outsideRange, rangeAlerts, average, dayDiff, dryRatio, formatDay, formatGrams, isActiveGrow, conditionLabel, GROW_PHASE_NAMES, shiftDay, vpdKpa } from "@/lib/grows";
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
  const targets = { ph: { min: 5.8, max: 6.5 } };
  const point = (date: string, over: Partial<{ ph: number | null; ec: number | null; vpd: number | null; temp: number | null; rh: number | null }> = {}) => ({ day: 1, date, temp: null, rh: null, vpd: null, ec: null, ph: null, ...over });

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

  const phases = (starts: Record<string, string>, active: string) => GROW_PHASE_NAMES.map((label) => ({ key: label.toLowerCase(), label, done: false, active: label === active, startedOn: starts[label] ?? null }));
  const growOf = (targets: Parameters<typeof effectiveTargets>[1] = {}, over: Record<string, unknown> = {}) => ({
    targets, phase: "Blüte", phases: phases({ Keimung: "2026-09-01", Vegetativ: "2026-09-08", Blüte: "2026-10-01" }, "Blüte"), env: [] as ReturnType<typeof point>[], ...over,
  });

  it("Richtwerte je Phase: fünf Größen je Phase, Trocknen/Curing ohne pH, EC und VPD", () => {
    for (const phase of GROW_PHASE_NAMES) expect(Object.keys(PHASE_TARGETS[phase]).sort()).toEqual([...TARGET_KEYS].sort());
    for (const phase of ["Keimung", "Vegetativ", "Blüte"] as const) for (const key of TARGET_KEYS) { const r = PHASE_TARGETS[phase][key]!; expect(r.min).toBeLessThan(r.max); }
    expect(PHASE_TARGETS.Trocknen).toMatchObject({ ph: null, ec: null, vpd: null });
    expect(PHASE_TARGETS.Curing.rh).toEqual({ min: 58, max: 65 });
  });

  it("effectiveTargets: Überschreibung vor Phasen-Richtwert, null = kein Ziel, unbekannte Phase fällt auf Vegetativ", () => {
    expect(effectiveTargets("Blüte", {}).vpd).toEqual({ min: 1, max: 1.5 });
    expect(effectiveTargets("Blüte", { vpd: { min: 0.9, max: 1.1 } }).vpd).toEqual({ min: 0.9, max: 1.1 });
    expect(effectiveTargets("Blüte", { ec: null }).ec).toBeNull();
    expect(effectiveTargets("Blüte", { ec: null }).ph).toEqual({ min: 5.8, max: 6.5 });
    expect(effectiveTargets("?", {})).toEqual(PHASE_TARGETS.Vegetativ);
  });

  it("phaseAtDate/targetsOn: die Phase richtet sich nach dem Tag der Messung; ohne Phasenstarts gilt die aktuelle", () => {
    const g = growOf();
    expect(phaseAtDate(g, "2026-09-01")).toBe("Keimung");
    expect(phaseAtDate(g, "2026-09-07")).toBe("Keimung");
    expect(phaseAtDate(g, "2026-09-08")).toBe("Vegetativ");
    expect(phaseAtDate(g, "2026-10-15")).toBe("Blüte");
    expect(phaseAtDate(g, "2020-01-01")).toBe("Keimung");
    expect(targetsOn(g, "2026-09-20").ec).toEqual(PHASE_TARGETS.Vegetativ.ec);
    expect(phaseAtDate({ phases: phases({}, "Blüte") }, "2026-09-01")).toBe("Blüte");
  });

  it("targetSteps: gleiche Nachbarn werden zusammengefasst, null-Abschnitte bleiben, nirgends ein Ziel = null", () => {
    const g = growOf();
    expect(targetSteps(g, "ph")).toEqual([{ from: "2026-09-01", range: { min: 5.8, max: 6.5 } }]);
    expect(targetSteps(g, "ec")?.map((st) => st.from)).toEqual(["2026-09-01", "2026-09-08", "2026-10-01"]);
    const dried = growOf({}, { phases: phases({ Keimung: "2026-09-01", Trocknen: "2026-11-01" }, "Trocknen"), phase: "Trocknen" });
    expect(targetSteps(dried, "ph")).toEqual([{ from: "2026-09-01", range: { min: 5.8, max: 6.5 } }, { from: "2026-11-01", range: null }]);
    expect(targetSteps(growOf({ vpd: null }), "vpd")).toBeNull();
    expect(targetSteps(growOf({ ec: null }), "ec")).toBeNull();
    expect(targetSteps(growOf({}, { phases: [] }), "ph")).toEqual([{ from: "0000-01-01", range: { min: 5.8, max: 6.5 } }]);
  });

  it("rangeAlerts: nur der jeweils letzte Wert zählt, gemessen an der Phase des Messtags; Ziel aus = kein Hinweis", () => {
    const env = [
      point("2026-09-20", { ph: 7.5, ec: 3 }), // alt, außerhalb – wird vom neueren überholt
      point("2026-09-21", { ph: 6.1, ec: 1.7, vpd: 1.5 }), // Vegetativ: EC-Ziel 0,8–1,6, VPD 0,8–1,2
      point("2026-09-22", { ph: null, ec: null, vpd: null }), // leerer Tag ändert nichts
    ];
    const alerts = rangeAlerts(growOf({}, { env }));
    expect(alerts.map((a) => [a.key, a.direction, a.date, a.phase])).toEqual([["ec", "high", "2026-09-21", "Vegetativ"], ["vpd", "high", "2026-09-21", "Vegetativ"]]);
    expect(rangeAlerts(growOf({ ec: null, vpd: null }, { env })).map((a) => a.key)).toEqual([]);
    // Dieselben Werte in der Blüte (EC bis 2, VPD bis 1,5) sind in Ordnung.
    expect(rangeAlerts(growOf({}, { env: [point("2026-10-05", { ec: 1.7, vpd: 1.5 })] }))).toEqual([]);
    // Temperatur und Luftfeuchte zählen jetzt ebenfalls.
    const climate = rangeAlerts(growOf({}, { env: [point("2026-10-05", { temp: 31, rh: 30 })] }));
    expect(climate.map((a) => [a.key, a.direction])).toEqual([["temp", "high"], ["rh", "low"]]);
    expect(rangeAlerts(growOf({}, { env: [] }))).toEqual([]);
  });
});
