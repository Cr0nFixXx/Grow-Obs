import { describe, expect, it } from "vitest";
import { defaultFeatures, featureMeta, resolveFeatureFlags } from "./features";

describe("feature override validation", () => {
  it("rejects malformed storage and non-boolean values", () => {
    for (const value of [null, [], "invalid", 1]) expect(resolveFeatureFlags(value)).toEqual(defaultFeatures);
    expect(resolveFeatureFlags({ grows: "false", unknown: false })).toEqual(defaultFeatures);
  });
  it("allows a feature to be disabled, but cannot disable core access locally", () => {
    const flags = resolveFeatureFlags({ grows: false, auth: false, devAdmin: false });
    expect(flags.grows).toBe(false);
    expect(flags.auth).toBe(true);
    expect(flags.devAdmin).toBe(true);
  });
  it("has metadata exactly once for every registered flag", () => {
    expect(featureMeta.map((f) => f.key).sort()).toEqual(Object.keys(defaultFeatures).sort());
  });
});