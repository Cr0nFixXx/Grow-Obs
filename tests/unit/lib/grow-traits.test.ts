import { describe, expect, it } from "vitest";
import { GENETICS, LIGHT_LABEL, LIGHT_TYPES, SEED_LABEL, SEED_TYPES, SITE_LABEL, deriveGrowType, hasTraits, strainTraitLabels } from "@/lib/grow-traits";

describe("Sorten-Eigenschaften (B-105)", () => {
  it("Beschriftungen für alle Codes", () => {
    expect(GENETICS).toEqual(["Indica", "Sativa", "Hybrid"]);
    expect(LIGHT_TYPES.map((l) => LIGHT_LABEL[l])).toEqual(["Photoperiodisch", "Fast", "Auto"]);
    expect(SEED_TYPES.map((s) => SEED_LABEL[s])).toEqual(["Regulär", "Feminisiert"]);
    expect(SITE_LABEL).toEqual({ indoor: "Indoor", outdoor: "Outdoor" });
  });
  it("Angaben erkennen und beschriften", () => {
    expect(hasTraits({})).toBe(false);
    expect(hasTraits({ genetics: null, light: null, seed: null })).toBe(false);
    expect(hasTraits({ seed: "regular" })).toBe(true);
    expect(strainTraitLabels({ genetics: "Indica", light: "auto", seed: "feminized" })).toEqual(["Indica", "Auto", "Feminisiert"]);
    expect(strainTraitLabels({ light: "photo" })).toEqual(["Photoperiodisch"]);
    expect(strainTraitLabels({})).toEqual([]);
  });
  it("Typ des Grows: gleich → dieser, gemischt → Hybrid, keine Angabe → null", () => {
    expect(deriveGrowType([])).toBeNull();
    expect(deriveGrowType([{ genetics: null }, {}])).toBeNull();
    expect(deriveGrowType([{ genetics: "Sativa" }])).toBe("Sativa");
    expect(deriveGrowType([{ genetics: "Indica" }, { genetics: "Indica" }, { genetics: null }])).toBe("Indica");
    expect(deriveGrowType([{ genetics: "Indica" }, { genetics: "Sativa" }])).toBe("Hybrid");
  });
});
