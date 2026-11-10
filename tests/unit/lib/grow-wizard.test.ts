import { describe, expect, it } from "vitest";
import type { GrowStrain } from "@/types";
import {
  daysSince, draftStrains, firstInvalidStep, isDraftDirty, newDraft, startDateError, startPreview, startPresets, stepError, strainStepError, toCreateInput,
} from "@/lib/grow-wizard";

const TODAY = "2026-10-01";
const strain = (p: Partial<GrowStrain> = {}): GrowStrain => ({ name: "", breeder: "", plants: null, wetG: null, dryG: null, ...p });

describe("Grow-Wizard (B-102)", () => {
  it("startet mit Vorgaben: Living Soil, Hybrid, privat, heute, eine leere Sortenzeile", () => {
    const d = newDraft();
    expect(d).toMatchObject({ name: "", medium: "Living Soil (No-Till)", type: "Hybrid", visibility: "private" });
    expect(d.strains).toHaveLength(1);
    expect(isDraftDirty(d)).toBe(false);
  });

  it("Schritt 1: nur der Name ist Pflicht, Sorten sind freiwillig", () => {
    const d = newDraft();
    expect(stepError(0, d)).toBe("Bitte einen Namen angeben.");
    d.name = "  Run 1 ";
    expect(stepError(0, d)).toBe("");
    expect(firstInvalidStep(d)).toBe(-1);
    expect(isDraftDirty(d)).toBe(true);
  });

  it("leere Sortenzeilen werden ignoriert, halbe Zeilen und Doppelte sind Fehler", () => {
    expect(strainStepError([strain(), strain()])).toBe("");
    expect(strainStepError([strain({ breeder: "Barney's" })])).toMatch(/Namen/);
    expect(strainStepError([strain({ plants: 2 })])).toMatch(/Namen/);
    expect(strainStepError([strain({ name: "Haze" }), strain({ name: " haze " })])).toMatch(/doppelt/);
    expect(strainStepError([strain({ name: "Haze", plants: 0 })])).toMatch(/Pflanzenzahl/);
    expect(draftStrains([strain({ name: " Haze ", breeder: " X " }), strain()])).toEqual([strain({ name: "Haze", breeder: "X" })]);
  });

  it("Startdatum: nicht leer, nicht in der Zukunft, nicht vor 2000", () => {
    expect(startDateError("", TODAY)).toMatch(/angeben/);
    expect(startDateError("2026-10-02", TODAY)).toMatch(/Zukunft/);
    expect(startDateError("1999-12-31", TODAY)).toMatch(/zurück/);
    expect(startDateError("2026-10-01", TODAY)).toBe("");
    const d = { ...newDraft(), name: "x", startDate: "2027-01-01" };
    expect(firstInvalidStep(d, TODAY)).toBe(2);
  });

  it("Schnellwahl und Vorschau rechnen in Kalendertagen", () => {
    expect(startPresets(TODAY).map((p) => [p.label, p.value])).toEqual([["Heute", "2026-10-01"], ["Gestern", "2026-09-30"], ["Vor 1 Woche", "2026-09-24"], ["Vor 2 Wochen", "2026-09-17"]]);
    expect(daysSince("2026-09-17", TODAY)).toBe(14);
    expect(daysSince(TODAY, TODAY)).toBe(0);
    expect(startPreview(TODAY, TODAY)).toMatch(/heute \(Tag 0\)/);
    expect(startPreview("2026-09-24", TODAY)).toMatch(/Tag 7/);
    expect(startPreview("", TODAY)).toBe("");
  });

  it("baut die Anfrage: ohne Sorten wird `strains` weggelassen, sonst gesäubert", () => {
    const base = { ...newDraft(), name: " Run 2 ", visibility: "community" as const, medium: "Erde (Bio)", type: "Indica" as const, startDate: "2026-09-24" };
    const none = toCreateInput(base);
    expect(none).toEqual({ name: "Run 2", medium: "Erde (Bio)", type: "Indica", startDate: "2026-09-24", visibility: "community" });
    expect("strains" in none).toBe(false);
    const two = toCreateInput({ ...base, strains: [strain({ name: " A " }), strain(), strain({ name: "B", plants: 3 })] });
    expect(two.strains?.map((s) => [s.name, s.plants])).toEqual([["A", null], ["B", 3]]);
  });
});
