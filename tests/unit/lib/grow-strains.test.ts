import { describe, expect, it } from "vitest";
import { MAX_GROW_STRAINS, cleanStrains, emptyStrain, growStrains, strainListError, strainSummary, totalPlants } from "@/lib/grow-strains";
import type { GrowStrain } from "@/types";

const s = (name: string, extra: Partial<GrowStrain> = {}): GrowStrain => ({ ...emptyStrain(), name, ...extra });

describe("strainSummary", () => {
  it("eine, mehrere und keine Sorte", () => {
    expect(strainSummary(["Gorilla Glue"])).toBe("Gorilla Glue");
    expect(strainSummary(["A", "B"])).toBe("A und 1 weitere");
    expect(strainSummary(["A", "B", "C", "D"])).toBe("A und 3 weitere");
    expect(strainSummary([])).toBe("Unbekannt");
    expect(strainSummary(["  ", ""])).toBe("Unbekannt");
  });
});

describe("strainListError", () => {
  it("gültige Liste ist leer", () => {
    expect(strainListError([s("A"), s("B", { plants: 2, breeder: "X" })])).toBe("");
  });
  it("leere Liste, leerer Name, Pflanzenzahl, Doppelte, Obergrenze", () => {
    expect(strainListError([])).toMatch(/mindestens eine/i);
    expect(strainListError([s("A"), s("  ")])).toMatch(/Namen/);
    expect(strainListError([s("A", { plants: 0 })])).toMatch(/Pflanzenzahl/);
    expect(strainListError([s("A", { plants: 1.5 })])).toMatch(/Pflanzenzahl/);
    expect(strainListError([s("A"), s("a")])).toMatch(/doppelt/);
    expect(strainListError([s("A", { breeder: "X" }), s("A", { breeder: "Y" })])).toBe("");
    expect(strainListError(Array.from({ length: MAX_GROW_STRAINS + 1 }, (_, i) => s(`S${i}`)))).toMatch(/Höchstens/);
    expect(strainListError(Array.from({ length: MAX_GROW_STRAINS }, (_, i) => s(`S${i}`)))).toBe("");
  });
});

describe("growStrains / cleanStrains / totalPlants", () => {
  it("Rückfall auf die alte Einzelsorte", () => {
    expect(growStrains({ strain: "Alt", breeder: "Unbekannt" })).toEqual([{ ...s("Alt"), id: "legacy" }]);
    expect(growStrains({ strain: "Unbekannt", breeder: "" })).toEqual([]);
    expect(growStrains({ strain: "x", breeder: "", strains: [s("Neu")] })).toEqual([s("Neu")]);
  });
  it("säubert Leerzeichen, behält Gewichte", () => {
    expect(cleanStrains([s("  A ", { breeder: " B ", wetG: 5 })])).toEqual([s("A", { breeder: "B", wetG: 5 })]);
  });
  it("Pflanzensumme nur mit mindestens einer Angabe", () => {
    expect(totalPlants([s("A"), s("B")])).toBeNull();
    expect(totalPlants([s("A", { plants: 2 }), s("B"), s("C", { plants: 3 })])).toBe(5);
  });
});
