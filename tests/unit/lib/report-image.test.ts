import { describe, expect, it } from "vitest";
import { buildReportImageModel, reportImageName } from "@/lib/report-image";
import type { Grow } from "@/types";

const grow = {
  name: "Cherry Run", strain: "Cherry", breeder: "Acme", medium: "Erde", startDate: "2026-08-01", day: 40, totalDays: 90, phase: "Blüte",
  condition: "good", expectedYield: "120 g", progress: 140,
  phases: [{ key: "veg", label: "Wachstum", startedOn: "2026-08-01", done: true }, { key: "flower", label: "Blüte", startedOn: null, active: true }],
  env: [
    { day: 3, temp: 24, rh: 60, vpd: 1.1, ec: null, ph: 6.2 },
    { day: 1, temp: 22, rh: 55, vpd: 0.9, ec: 1.2, ph: 6.0 },
    { day: 2, temp: null, rh: 58, vpd: null, ec: null, ph: null },
  ],
  harvest: null,
} as unknown as Grow;

describe("Report-Bild (B-90)", () => {
  it("baut das Modell aus dem Grow: Kennzahlen, Phasen, Klima sortiert, Fortschritt begrenzt", () => {
    const m = buildReportImageModel(grow, new Date("2026-10-01T10:00:00Z"));
    expect(m.subtitle).toContain("Cherry Run");
    expect(m.metrics.map((x) => x.label)).toEqual(["Dauer", "Zustand", "Erwartet", "Phase"]);
    expect(m.metrics[0].value).toBe("40 Tage");
    expect(m.progress).toBe(100);
    expect(m.phases).toHaveLength(2);
    expect(m.phases[1]).toMatchObject({ active: true, note: "offen" });
    // nur Tage mit Temperatur UND Feuchte, älteste zuerst
    expect(m.climate.labels).toEqual(["T1", "T3"]);
    expect(m.climate.temp).toEqual([22, 24]);
    expect(m.averages[3].value).toContain("23");
    expect(m.conclusion).toContain("Tag 40 von 90");
    expect(m.footer).toContain("Grow|Obs");
  });
  it("Dateiname: Slug mit Umlauten und Datum", () => {
    expect(reportImageName("Süße Ärnte #1", new Date(2026, 9, 4))).toBe("susse-arnte-1-report-2026-10-04.png");
    expect(reportImageName("!!!", new Date(2026, 0, 5))).toBe("grow-report-2026-01-05.png");
  });
});
