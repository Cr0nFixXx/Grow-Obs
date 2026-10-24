import { describe, expect, it } from "vitest";
import { GROW_PHASES, dayDiff, growState, isIsoDate, todayIso } from "../../apps/api/src/lib/grow-state.ts";

const base = { startDate: "2026-09-01", totalDays: 100, phaseIndex: 0, status: "active", endedOn: null as string | null, phaseDates: {} as Record<string, string> };

describe("Grow-Berechnung (B-84)", () => {
  it("Datum: heute in Berlin, gültige Kalendertage, Tagesabstand ohne negative Werte", () => {
    expect(todayIso(new Date("2026-10-23T22:30:00Z"))).toBe("2026-10-24"); // nach Mitternacht in Berlin
    expect(todayIso(new Date("2026-10-23T21:30:00Z"))).toBe("2026-10-23");
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("26-1-1")).toBe(false);
    expect(dayDiff("2026-09-01", "2026-10-01")).toBe(30);
    expect(dayDiff("2026-10-01", "2026-09-01")).toBe(0);
    expect(dayDiff("kaputt", "2026-09-01")).toBe(0);
  });

  it("Tag und Fortschritt kommen aus dem Startdatum, nicht aus der Datenbank", () => {
    const s = growState(base, "2026-09-26");
    expect(s.day).toBe(25);
    expect(s.progress).toBe(25);
    expect(growState(base, "2027-06-01").progress).toBe(100); // nie über 100 %
    expect(growState({ ...base, startDate: "2026-09-26" }, "2026-09-26").day).toBe(0);
  });

  it("Phasen: fünf Stück, erledigt vor der aktuellen, Datum und Starttag je Phase", () => {
    const s = growState({ ...base, phaseIndex: 2, phaseDates: { Keimung: "2026-09-01", Vegetativ: "2026-09-06", Blüte: "2026-10-06" } }, "2026-10-10");
    expect(s.phases.map((p) => p.label)).toEqual([...GROW_PHASES]);
    expect(s.phases.map((p) => p.done)).toEqual([true, true, false, false, false]);
    expect(s.phases.map((p) => p.active)).toEqual([false, false, true, false, false]);
    expect(s.phases[2]).toMatchObject({ startedOn: "2026-10-06", startDay: 35 });
    expect(s.phases[3]).toMatchObject({ startedOn: null, startDay: null });
    expect(s.phase).toBe("Blüte");
  });

  it("Abgeschlossen: Tag friert am Enddatum ein; Ernte = 100 %, Abbruch behält den Stand", () => {
    const harvested = growState({ ...base, phaseIndex: 3, status: "harvested", endedOn: "2026-11-20" }, "2027-03-01");
    expect(harvested.day).toBe(80);
    expect(harvested.progress).toBe(100);
    expect(harvested.phases.every((p) => p.done) && harvested.phases.every((p) => !p.active)).toBe(true);
    const aborted = growState({ ...base, status: "aborted", endedOn: "2026-09-21" }, "2027-03-01");
    expect(aborted.day).toBe(20);
    expect(aborted.progress).toBe(20);
    expect(aborted.phases.some((p) => p.active)).toBe(false);
  });

  it("ungültiger Phasenindex wird begrenzt", () => {
    expect(growState({ ...base, phaseIndex: 99 }, "2026-09-02").phase).toBe("Curing");
    expect(growState({ ...base, phaseIndex: -3 }, "2026-09-02").phase).toBe("Keimung");
  });
});
