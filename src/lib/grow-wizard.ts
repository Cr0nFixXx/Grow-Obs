import type { CreateGrowInput, GrowStrain, GrowVisibility } from "@/types";
import { GROW_MEDIUMS, GROW_TYPES, todayLocal } from "@/lib/grows";
import { cleanStrains, emptyStrain, strainListError } from "@/lib/grow-strains";

/** B-102: „Neuer Grow“ als Wizard in vier Schritten. */
export const WIZARD_STEPS = [
  { key: "basics", title: "Name & Sorten", short: "Name" },
  { key: "setup", title: "Anbau", short: "Anbau" },
  { key: "start", title: "Start & Sichtbarkeit", short: "Start" },
  { key: "review", title: "Übersicht", short: "Fertig" },
] as const;
export const LAST_STEP = WIZARD_STEPS.length - 1;

export interface WizardDraft {
  name: string;
  strains: GrowStrain[];
  medium: string;
  type: (typeof GROW_TYPES)[number];
  startDate: string;
  visibility: GrowVisibility;
}

export const newDraft = (): WizardDraft => ({ name: "", strains: [emptyStrain()], medium: GROW_MEDIUMS[0], type: "Hybrid", startDate: todayLocal(), visibility: "private" });

export const MEDIUM_INFO: Record<string, { icon: string; hint: string }> = {
  "Living Soil (No-Till)": { icon: "Sprout", hint: "Lebendige Erde, kein Umtopfen" },
  "Erde (Bio)": { icon: "Leaf", hint: "Bio-Erde mit Nährstoffen" },
  "Kokos/Perlit 70/30": { icon: "Layers", hint: "Schnell, präzise zu düngen" },
  "Hydro / DWC": { icon: "Droplets", hint: "Wurzeln im Nährwasser" },
};
export const TYPE_INFO: Record<(typeof GROW_TYPES)[number], string> = {
  Hybrid: "Mischung aus beiden",
  Indica: "Kompakt, eher entspannend",
  Sativa: "Hoch gewachsen, eher anregend",
};
export const VISIBILITY_INFO: Record<GrowVisibility, { icon: string; hint: string }> = {
  private: { icon: "Lock", hint: "Nur du siehst den Grow" },
  public: { icon: "Globe", hint: "Alle Mitglieder, nur lesend" },
  community: { icon: "Users", hint: "Gemeinsame Communities, nur lesend" },
};

/** Zeile ohne jede Eingabe: wird beim Anlegen ignoriert. */
export const isBlankStrain = (s: GrowStrain) => !s.name.trim() && !s.breeder.trim() && s.plants === null;

/** Die tatsächlich gespeicherten Sorten (leere Zeilen entfallen, Leerzeichen gesäubert). */
export const draftStrains = (list: GrowStrain[]): GrowStrain[] => cleanStrains(list.filter((s) => !isBlankStrain(s)));

/** Sorten sind freiwillig: ohne Eingabe kein Fehler, sonst gelten die üblichen Regeln. */
export function strainStepError(list: GrowStrain[]): string {
  const rows = draftStrains(list);
  return rows.length === 0 ? "" : strainListError(rows);
}

export function startDateError(date: string, today = todayLocal()): string {
  if (!date) return "Bitte ein Startdatum angeben.";
  if (date > today) return "Das Startdatum liegt in der Zukunft.";
  if (date < "2000-01-01") return "Das Startdatum liegt zu weit zurück.";
  return "";
}

/** Fehlertext des Schritts oder leer. */
export function stepError(step: number, d: WizardDraft, today = todayLocal()): string {
  if (step === 0) return !d.name.trim() ? "Bitte einen Namen angeben." : strainStepError(d.strains);
  if (step === 2) return startDateError(d.startDate, today);
  return "";
}

/** Erster ungültiger Schritt (für „Anlegen“) oder −1. */
export const firstInvalidStep = (d: WizardDraft, today = todayLocal()) => [0, 1, 2].find((s) => stepError(s, d, today)) ?? -1;

/** Hat der Nutzer schon etwas eingegeben (für die Rückfrage beim Abbrechen)? */
export const isDraftDirty = (d: WizardDraft) => !!d.name.trim() || d.strains.some((s) => !isBlankStrain(s));

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Tage zwischen Startdatum und heute (heute = 0). */
export const daysSince = (iso: string, today = todayLocal()) => Math.round((noon(today) - noon(iso)) / 86_400_000);

/** Schnellwahl für das Startdatum. */
export function startPresets(today = todayLocal()): { label: string; value: string }[] {
  const back = (n: number) => isoOf(noon(today) - n * 86_400_000);
  return [
    { label: "Heute", value: today },
    { label: "Gestern", value: back(1) },
    { label: "Vor 1 Woche", value: back(7) },
    { label: "Vor 2 Wochen", value: back(14) },
  ];
}

/** Satz zur Vorschau unter dem Startdatum. */
export function startPreview(date: string, today = todayLocal()): string {
  if (startDateError(date, today)) return "";
  const days = daysSince(date, today);
  if (days === 0) return "Der Grow startet heute (Tag 0).";
  return `Der Grow beginnt rückwirkend – heute ist Tag ${days}.`;
}

export const startLabel = (date: string) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "–");

/** Anfrage an die API: ohne Sorten wird das Feld weggelassen. */
export function toCreateInput(d: WizardDraft): CreateGrowInput {
  const strains = draftStrains(d.strains);
  return {
    name: d.name.trim(),
    ...(strains.length ? { strains } : {}),
    medium: d.medium,
    type: d.type,
    startDate: d.startDate || undefined,
    visibility: d.visibility,
  };
}
