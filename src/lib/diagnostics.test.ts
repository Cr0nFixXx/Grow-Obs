import { describe, expect, it } from "vitest";
import { healthRows, runDiagnostic } from "./diagnostics";
import type { AdminService, SystemHealth } from "@/services/interfaces";

const unknown = { ok: false, status: "unknown" as const, hint: "Nicht konfiguriert" };
const report: SystemHealth = {
  ok: false, mode: "development", latencyMs: 10, version: "test",
  services: { api: { ok: true, status: "ok", hint: "API" }, db: { ok: false, status: "down", hint: "Fehler" }, storage: unknown, ai: unknown },
};
describe("admin diagnostics", () => {
  it("never infers DB health from an API/liveness result", () => {
    expect(healthRows(report).map((row) => row.status)).toEqual(["ok", "down", "unknown", "unknown"]);
    expect(healthRows({ ok: true } as SystemHealth).every((row) => row.status === "unknown")).toBe(true);
  });
  it("marks every demo check as unknown", () => {
    expect(healthRows({ ...report, mode: "mock" }).every((row) => row.status === "unknown")).toBe(true);
  });
  it("rejects arbitrary endpoint URLs", async () => {
    await expect(runDiagnostic("https://other.test", {} as AdminService)).rejects.toThrow("nicht erlaubt");
  });
});