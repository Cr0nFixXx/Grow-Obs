import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as fields from "@/lib/profile-fields";

/** Die Listen stehen bewusst doppelt (Frontend/Backend sind getrennte Pakete) – dieser Test hält sie gleich. */
describe("profile-fields", () => {
  it("entspricht der Kopie im Backend (ohne Kommentarzeile)", () => {
    const strip = (text: string) => text.split("\n").slice(1).join("\n");
    const api = readFileSync(new URL("../../../apps/api/src/lib/profile-fields.ts", import.meta.url), "utf8");
    const web = readFileSync(new URL("../../../src/lib/profile-fields.ts", import.meta.url), "utf8");
    expect(strip(web)).toBe(strip(api));
  });
  it("hat plausible Grenzen", () => {
    expect(fields.INTERESTS.length).toBeGreaterThanOrEqual(fields.INTERESTS_MAX);
    expect(new Set(fields.INTERESTS).size).toBe(fields.INTERESTS.length);
    expect(fields.HANDLE_PATTERN.test("max_grows")).toBe(true);
    expect(fields.HANDLE_PATTERN.test("ab")).toBe(false);
    expect(fields.HANDLE_PATTERN.test("a b c")).toBe(false);
  });
});
