import type { Grow, GrowStrain } from "@/types";
import { strainNamesOf, strainsWithId } from "@/lib/strain-diary";
import { todayLocal } from "@/lib/grows";

/**
 * CSV-Export eines Grows (B-88): Semikolon als Trennzeichen, Dezimalkomma, UTF-8 mit BOM und Windows-Zeilenenden –
 * so öffnet deutsches Excel die Datei ohne Import-Assistenten.
 */
const SEP = ";";
const EOL = "\r\n";

/** Textzelle: Anführungszeichen verdoppeln, bei Trennzeichen/Zeilenumbruch einrahmen; Zellen, die mit `= + - @` beginnen, werden entschärft (Formel-Einschleusung in Tabellenprogrammen). */
export function csvText(value: string): string {
  let v = value.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Zahlenzelle mit Dezimalkomma; leer, wenn kein Wert. */
export function csvNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value).replace(".", ",");
}

const csvDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const line = (cells: string[]) => cells.join(SEP);
const BOM = "\uFEFF";

/** Messwerte, älteste zuerst. */
export function envCsv(grow: Pick<Grow, "env"> & Partial<Pick<Grow, "strainEnv" | "strain" | "breeder">> & { strains?: GrowStrain[] }): string {
  // B-101: gibt es pH/EC je Sorte, kommt eine Spalte „Sorte“ dazu (Zeilen des ganzen Grows: „Ganzer Grow“; Sortenzeilen nur pH/EC).
  if (grow.strainEnv?.length) {
    const names = new Map(strainsWithId({ strain: grow.strain ?? "", breeder: grow.breeder ?? "", strains: grow.strains }).map((s) => [s.id, s.name]));
    const whole = grow.env.map((e) => ({ date: e.date, order: 0, cells: [csvDate(e.date), String(e.day), csvText("Ganzer Grow"), csvNumber(e.temp), csvNumber(e.rh), csvNumber(e.vpd), csvNumber(e.ec), csvNumber(e.ph)] }));
    const per = grow.strainEnv.map((e) => ({ date: e.date, order: 1, cells: [csvDate(e.date), String(e.day), csvText(names.get(e.strainId) ?? "Entfernte Sorte"), "", "", "", csvNumber(e.ec), csvNumber(e.ph)] }));
    const rows = [...whole, ...per].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order).map((r) => line(r.cells));
    return BOM + [line(["Datum", "Tag", "Sorte", "Temperatur (°C)", "Luftfeuchte (%)", "VPD (kPa)", "EC (mS)", "pH"]), ...rows].join(EOL) + EOL;
  }
  const rows = [...grow.env].sort((a, b) => a.date.localeCompare(b.date)).map((e) => line([
    csvDate(e.date), String(e.day), csvNumber(e.temp), csvNumber(e.rh), csvNumber(e.vpd), csvNumber(e.ec), csvNumber(e.ph),
  ]));
  return BOM + [line(["Datum", "Tag", "Temperatur (°C)", "Luftfeuchte (%)", "VPD (kPa)", "EC (mS)", "pH"]), ...rows].join(EOL) + EOL;
}

/** Tagebuch-Einträge, älteste zuerst. */
export function logsCsv(grow: Pick<Grow, "logs"> & Partial<Pick<Grow, "strain" | "breeder">> & { strains?: GrowStrain[] }): string {
  // B-101: sind Einträge einzelnen Sorten zugeordnet, kommt eine Spalte „Sorten“ dazu.
  if (grow.logs.some((l) => l.strainIds?.length)) {
    const source = { strain: grow.strain ?? "", breeder: grow.breeder ?? "", strains: grow.strains };
    const rows = [...grow.logs].sort((a, b) => a.date.localeCompare(b.date)).map((l) => line([csvDate(l.date), String(l.day), csvText(l.tag), csvText(strainNamesOf(source, l.strainIds).join(", ") || "Ganzer Grow"), csvText(l.title), csvText(l.text)]));
    return BOM + [line(["Datum", "Tag", "Art", "Sorten", "Titel", "Notiz"]), ...rows].join(EOL) + EOL;
  }
  const rows = [...grow.logs].sort((a, b) => a.date.localeCompare(b.date)).map((l) => line([csvDate(l.date), String(l.day), csvText(l.tag), csvText(l.title), csvText(l.text)]));
  return BOM + [line(["Datum", "Tag", "Art", "Titel", "Notiz"]), ...rows].join(EOL) + EOL;
}

/** Dateiname: „cherry-run-messwerte-2026-10-24.csv“. */
export function csvFileName(name: string, part: string, today = todayLocal()): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "grow";
  return `${slug}-${part}-${today}.csv`;
}

/** Datei im Browser speichern. */
export function downloadCsv(grow: Pick<Grow, "name">, part: "messwerte" | "tagebuch", content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFileName(grow.name, part);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
