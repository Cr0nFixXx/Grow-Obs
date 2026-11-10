import { describe, expect, it } from "vitest";
import { ALL_STRAINS, effectiveValue, envDates, feedData, plantLabel, isMultiStrain, matchesStrainFilter, strainEnvOn, strainNamesOf, strainsWithId } from "@/lib/strain-diary";
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

  it("pH/EC-Reihen: eine Linie je Sorte, Werte des ganzen Grows gelten als Grundwert, Lücken bleiben null, Filter und Zeitraum wirken", () => {
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
    // kein eigenes „Ganzer Grow“ mehr: Beta zeigt am 1.9. den Wert des ganzen Grows (6,0), am 2.9. den eigenen
    expect(all.ph.map((l) => [l.label, l.values])).toEqual([["Alpha", [6.1, 6.2]], ["Beta", [6.0, 5.9]]]);
    expect(all.ec.map((l) => [l.label, l.values])).toEqual([["Alpha", [1.0, 1.4]], ["Beta", [1.0, null]]]);
    const onlyB = feedData(g, "b");
    expect(onlyB.ph.map((l) => l.label)).toEqual(["Beta"]);
    const ranged = feedData(g, ALL_STRAINS, "2026-09-02");
    expect(ranged.dates).toEqual(["2026-09-02"]);
  });

  it("B-104: Sorten ohne eigene Werte teilen sich eine Linie „Alle Pflanzen“; Einzelpflanzen bekommen eigene Linien", () => {
    const plants = (n: number) => ({ ...st("a", "Alpha"), plants: n });
    const onlyWhole = grow({ env: [env("2026-09-01", { ph: 6.0 }), env("2026-09-02", { ph: 6.2 })] });
    expect(feedData(onlyWhole, ALL_STRAINS).ph.map((l) => [l.label, l.values])).toEqual([["Alle Pflanzen", [6.0, 6.2]]]);
    const mixed = grow({
      strains: [plants(3), st("b", "Beta")],
      env: [env("2026-09-01", { ph: 6.0 })],
      strainEnv: [{ day: 1, date: "2026-09-01", strainId: "a", plant: 2, ph: 5.7, ec: null }],
    });
    const lines = feedData(mixed, ALL_STRAINS).ph;
    expect(lines.map((l) => [l.label, l.values])).toEqual([["Alle Pflanzen", [6.0]], ["Alpha · Pflanze 2", [5.7]]]);
    // eine Sorte mit mehreren Pflanzen: Beschriftung ohne Sortennamen
    const single = grow({ strains: [plants(2)], env: [env("2026-09-01", { ph: 6.0 })], strainEnv: [{ day: 1, date: "2026-09-01", strainId: "a", plant: 1, ph: 5.8, ec: null }] });
    expect(feedData(single, ALL_STRAINS).ph.map((l) => l.label)).toEqual(["Alle Pflanzen", "Pflanze 1"]);
    // Filter auf eine Sorte zeigt deren Pflanzen
    expect(feedData(mixed, "b").ph.map((l) => l.label)).toEqual(["Beta"]);
    expect(feedData(mixed, "a").ph.map((l) => l.label)).toEqual(["Alpha", "Alpha · Pflanze 2"]);
  });

  it("B-104: genaueste Angabe gewinnt – Pflanze vor Sorte vor ganzem Grow, pH und EC einzeln", () => {
    const g = grow({
      strains: [{ ...st("a", "Alpha"), plants: 3 }],
      env: [env("2026-09-01", { ph: 6.0, ec: 1.0 })],
      strainEnv: [
        { day: 1, date: "2026-09-01", strainId: "a", plant: 0, ph: 6.1, ec: null },
        { day: 1, date: "2026-09-01", strainId: "a", plant: 2, ph: 5.7, ec: null },
      ],
    });
    expect(effectiveValue(g, "2026-09-01", "a", 2, "ph")).toBe(5.7);
    expect(effectiveValue(g, "2026-09-01", "a", 3, "ph")).toBe(6.1); // Sortenwert
    expect(effectiveValue(g, "2026-09-01", "a", 3, "ec")).toBe(1.0); // nur der ganze Grow hat EC
    expect(effectiveValue(g, "2026-09-02", "a", 1, "ph")).toBeNull();
    expect(plantLabel("Alpha", 0, true)).toBe("Alpha");
    expect(plantLabel("Alpha", 2, true)).toBe("Alpha · Pflanze 2");
    expect(plantLabel("Alpha", 2, false)).toBe("Pflanze 2");
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
    const withPlants = envCsv(grow({ strains: [{ ...st("a", "Alpha"), plants: 2 }, st("b", "Beta")], env: [], strainEnv: [{ day: 1, date: "2026-09-01", strainId: "a", plant: 2, ph: 5.9, ec: null }] }));
    expect(withPlants).toContain("01.09.2026;1;Alpha · Pflanze 2;;;;;5,9");
  });
});
