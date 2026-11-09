import { describe, expect, it } from "vitest";
import { csvFileName, csvNumber, csvText, envCsv, logsCsv } from "@/lib/grow-csv";

const BOM = "\uFEFF";

describe("CSV-Export (B-88)", () => {
  it("Zahlen mit Dezimalkomma, leer ohne Wert", () => {
    expect(csvNumber(6.1)).toBe("6,1");
    expect(csvNumber(-2.5)).toBe("-2,5");
    expect(csvNumber(0)).toBe("0");
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(undefined)).toBe("");
    expect(csvNumber(Number.NaN)).toBe("");
  });

  it("Text: Anführungszeichen verdoppelt, bei Semikolon/Umbruch eingerahmt, Windows-Umbrüche vereinheitlicht", () => {
    expect(csvText("einfach")).toBe("einfach");
    expect(csvText("a;b")).toBe('"a;b"');
    expect(csvText('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(csvText("zwei\r\nZeilen")).toBe('"zwei\nZeilen"');
    expect(csvText("Komma, bleibt")).toBe("Komma, bleibt");
  });

  it("Text: Zellen, die als Formel gelesen würden, werden entschärft", () => {
    for (const bad of ["=SUMME(A1)", "+1", "-1+1", "@cmd", "\tx"]) expect(csvText(bad).startsWith("'")).toBe(true);
    expect(csvText("=1;2")).toBe("\"'=1;2\"");
    expect(csvText("Tag-1")).toBe("Tag-1");
  });

  it("Messwerte: BOM, Kopfzeile, älteste zuerst, leere Zellen, Datum deutsch", () => {
    const csv = envCsv({ env: [
      { day: 20, date: "2026-09-21", temp: 24.5, rh: 55, vpd: 1.13, ec: null, ph: 6.1 },
      { day: 19, date: "2026-09-20", temp: null, rh: null, vpd: null, ec: 1.4, ph: null },
    ] });
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Datum;Tag;Temperatur (°C);Luftfeuchte (%);VPD (kPa);EC (mS);pH",
      "20.09.2026;19;;;;1,4;",
      "21.09.2026;20;24,5;55;1,13;;6,1",
      "",
    ]);
  });

  it("Tagebuch: Notiz mit Umbruch und Semikolon bleibt in einer Zelle", () => {
    const csv = logsCsv({ logs: [{ id: "1", day: 5, date: "2026-09-06", title: "Gegossen; 1 L", text: "Zeile 1\nZeile 2", tag: "Gießen" }] });
    expect(csv.slice(1).split("\r\n")[0]).toBe("Datum;Tag;Art;Titel;Notiz");
    expect(csv).toContain('06.09.2026;5;Gießen;"Gegossen; 1 L";"Zeile 1\nZeile 2"\r\n');
  });

  it("leere Daten: nur die Kopfzeile", () => {
    expect(envCsv({ env: [] }).slice(1)).toBe("Datum;Tag;Temperatur (°C);Luftfeuchte (%);VPD (kPa);EC (mS);pH\r\n");
    expect(logsCsv({ logs: [] }).slice(1)).toBe("Datum;Tag;Art;Titel;Notiz\r\n");
  });

  it("Dateiname: Umlaute und Sonderzeichen werden zu einem sauberen Kürzel", () => {
    expect(csvFileName("Cherry Run – Klein", "messwerte", "2026-10-24")).toBe("cherry-run-klein-messwerte-2026-10-24.csv");
    expect(csvFileName("Größe Ärger", "tagebuch", "2026-10-24")).toBe("grosse-arger-tagebuch-2026-10-24.csv");
    expect(csvFileName("!!!", "tagebuch", "2026-10-24")).toBe("grow-tagebuch-2026-10-24.csv");
  });
});
