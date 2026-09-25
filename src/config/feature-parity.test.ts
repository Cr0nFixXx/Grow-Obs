import { describe, expect, it } from "vitest";
import { defaultFeatures, featureMeta } from "./features";
import { CORE_FEATURES, FEATURE_KEYS } from "../../apps/api/src/lib/feature-keys";

/** Frontend und API müssen dieselben Feature-Schlüssel und Kern-Features kennen. */
describe("feature flag parity (frontend ↔ API)", () => {
  it("uses the same feature keys", () => {
    expect([...FEATURE_KEYS].sort()).toEqual(Object.keys(defaultFeatures).sort());
  });
  it("marks the same features as core (not switchable)", () => {
    expect([...CORE_FEATURES].sort()).toEqual(featureMeta.filter((f) => f.core).map((f) => f.key).sort());
  });
});
