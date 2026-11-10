import { describe, expect, it } from "vitest";
import { ALL_STRAINS, envDates, feedData, isMultiStrain, matchesStrainFilter, strainEnvOn, strainNamesOf, strainsWithId } from "@/lib/strain-diary";
import { envCsv, logsCsv } from "@/lib/grow-csv";
import type { Grow } from "@/types";

const st = (id: string, name: string) => ({ id, name, breeder: "", plants: null, wetG: null, dryG: null });
const env = (date: string, extra: Record<string, number | null> = {}) => ({ day: 1, date, temp: null, rh: null, vpd: null, ec: null, ph: null, ...extra });
function grow(over: Partial<Grow> = {}): Grow {
  return { strain: "A, B", breeder: "", strains: [st("a", "Alpha"), st("b", "Beta")], env: [], strainEnv: [], logs: [], ...over } as unknown as Grow;
}

describe("Sorten im Tagebuch (B-101)", () => {
  it("erkennt mehrere Sorten und löst Namen auf (unbekannte entfallen)", () => {
    expect(isMultiStrain(grow())).toBe(true);
    expect(isMultiStrain(grow({ strains: [st("a", "Alpha")] }))).toBe(false);
    expect(strainNamesOf(grow(), ["b", "x", "a"])).toEqual(["Beta", "Alpha"]);
    expect(strainNamesOf(grow(), [])).toEqual([]);
    expect(strainNamesOf(grow(), undefined)).toEqual([]);
  });

  it("Altdaten ohne Liste bekommen die ID „legacy“, Sorten ohne ID eine Ersatz-ID", () => {
    expect(strainsWithId({ strain: "Alt", breeder: "" }).map((x) => x.id)).toEqual(["legacy"]);
    expect(strainsWithId({ strain: "x", breeder: "", strains: [{ name: "Ohne", breeder: "", plants: null, wetG: null, dryG: null }] })[0]!.id).toBe("s0");
  });

  it("Filter: „Alle“ zeigt alles, eine Sorte zeigt ihre Einträge und die für den ganzen Grow", () => {
    expect(matchesStrainFilter(["a"], ALL_STRAINS)).toBe(true);
    expect(matchesStrainFilter(["a"], "a")).toBe(true);
    expect(matchesStrainFilter(["a"], "b")).toBe(false);
    expect(matchesStrainFilter([], "b")).toBe(true);
    expect(matchesStrainFilter(undefined, "b")).toBe(true);
    expect(matchesStrainFilter(["a", "b"], "b")).toBe(true);
  });

  it("pH/EC-Reihen: eine Linie je Sorte plus Ganzer Grow, Lücken bleiben null, Filter und Zeitraum wirken", () => {
    const g = grow({
      env: [env("2026-09-01", { ph: 6.0, ec: 1.0 }), env("2026-09-02", { temp: 24 })],
      strainEnv: [
        { day: 1, date: "2026-09-01", strainId: "a", ph: 6.1, ec: null },
        { day: 2, date: "2026-09-02", strainId: "a", ph: 6.2, ec: 1.4 },
        { day: 2, date: "2026-09-02", strainId: "b", ph: 5.9, ec: null },
      ],
    });
    const all = feedData(g, ALL_STRAINS);
    expect(all.dates).toEqual(["2026-09-01", "2026-09-02"]);
    expect(all.ph.map((l) => [l.label, l.values])).toEqual([["Ganzer Grow", [6.0, null]], ["Alpha", [6.1, 6.2]], ["Beta", [null, 5.9]]]);
    expect(all.ec.map((l) => l.label)).toEqual(["Ganzer Grow", "Alpha"]); // Beta hat keinen EC-Wert → keine Linie
    const onlyB = feedData(g, "b");
    expect(onlyB.ph.map((l) => l.label)).toEqual(["Ganzer Grow", "Beta"]);
    const ranged = feedData(g, ALL_STRAINS, "2026-09-02");
    expect(ranged.dates).toEqual(["2026-09-02"]);
  });

  it("Tage mit Messwerten: Tageswerte und Sortenwerte, neueste zuerst; Sortenwerte je Tag", () => {
    const g = grow({ env: [env("2026-09-01", { temp: 20 })], strainEnv: [{ day: 3, date: "2026-09-03", strainId: "a", ph: 6, ec: null }] });
    expect(envDates(g)).toEqual(["2026-09-03", "2026-09-01"]);
    expect(strainEnvOn(g, "2026-09-03")).toHaveLength(1);
    expect(strainEnvOn(g, "2026-09-01")).toHaveLength(0);
  });

  it("CSV: Sorten-Spalten erscheinen nur, wenn es Zuordnungen gibt", () => {
    const plainLogs = logsCsv({ logs: [{ id: "1", day: 1, date: "2026-09-01", title: "T", text: "", tag: "Gießen" }] });
    expect(plainLogs).toContain("Datum;Tag;Art;Titel;Notiz");
    const g = grow({ logs: [{ id: "1", day: 1, date: "2026-09-01", title: "T", text: "", tag: "Gießen", strainIds: ["a", "b"] }, { id: "2", day: 2, date: "2026-09-02", title: "U", text: "", tag: "Gießen" }] });
    const logs = logsCsv(g);
    expect(logs).toContain("Datum;Tag;Art;Sorten;Titel;Notiz");
    expect(logs).toContain(";Alpha, Beta;");
    expect(logs).toContain("Ganzer Grow");
    expect(envCsv({ env: [env("2026-09-01", { temp: 20 })] })).toContain("Datum;Tag;Temperatur (°C)");
    const withStrains = envCsv(grow({ env: [env("2026-09-01", { temp: 20.5 })], strainEnv: [{ day: 1, date: "2026-09-01", strainId: "a", ph: 6.1, ec: 1.2 }] }));
    expect(withStrains).toContain("Datum;Tag;Sorte;Temperatur (°C)");
    expect(withStrains).toContain("01.09.2026;1;Ganzer Grow;20,5");
    expect(withStrains).toContain("01.09.2026;1;Alpha;;;;1,2;6,1");
  });
});
