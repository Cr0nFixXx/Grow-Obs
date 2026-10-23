import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_CODENAME, BACKEND_VERSION, BUILD_NUMBER, FRONTEND_VERSION, moduleVersion, versionLabel } from "@/lib/app-version";

const root = path.resolve(__dirname, "../../..");
const script = (...args: string[]) => execFileSync("node", [path.join(root, "scripts/version.mjs"), ...args], { cwd: root, encoding: "utf8" }).trim();

describe("zentrale Versionierung (version.json)", () => {
  it("Frontend, Backend, Codename und Build sind gesetzt und formal gültig", () => {
    expect(APP_CODENAME).toBeTruthy();
    expect(FRONTEND_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(BACKEND_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(BUILD_NUMBER).toMatch(/^\d{8}$/);
  });

  it("Anzeige-Label enthält Codename, Frontend-Version und Build-Nummer", () => {
    expect(versionLabel()).toBe(`${APP_CODENAME} v${FRONTEND_VERSION} · Build ${BUILD_NUMBER}`);
  });

  it("package.json (Frontend/Backend), Lockfiles und generierte Backend-Datei stimmen mit version.json überein", () => {
    expect(() => script("check")).not.toThrow();
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version).toBe(FRONTEND_VERSION);
    expect(JSON.parse(readFileSync(path.join(root, "apps/api/package.json"), "utf8")).version).toBe(BACKEND_VERSION);
  });

  it("Build-Nummer = YYMMDDHH in Europe/Berlin (Beispiel, Sommer- und Winterzeit)", () => {
    expect(script("print-build", "--date", "2026-09-25T16:22:00Z")).toBe("26092518"); // CEST = UTC+2
    expect(script("print-build", "--date", "2026-12-31T23:30:00Z")).toBe("27010100"); // CET = UTC+1, Jahreswechsel
    expect(script("print-build", "--date", "2026-03-29T00:30:00Z")).toBe("26032901"); // vor der Zeitumstellung: noch CET
    expect(script("print-build", "--date", "2026-03-29T01:30:00Z")).toBe("26032903"); // danach CEST (02→03 übersprungen)
  });

  it("Module erben die Version ihrer Hauptkomponente (Vorbereitung für Modul-Versionen)", () => {
    expect(moduleVersion("frontend", "forum")).toBe(FRONTEND_VERSION);
    expect(moduleVersion("backend", "auth")).toBe(BACKEND_VERSION);
  });
});
