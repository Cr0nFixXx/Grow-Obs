import type { Grow, GrowCondition, GrowStatus } from "@/types";
import type { Tone } from "@/lib/tokens";

/** Phasen eines Grows in Reihenfolge (B-84); die Phase wechselt der Nutzer selbst. */
export const GROW_PHASE_NAMES = ["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"] as const;
export const GROW_TYPES = ["Hybrid", "Indica", "Sativa"] as const;
export const GROW_MEDIUMS = ["Living Soil (No-Till)", "Erde (Bio)", "Kokos/Perlit 70/30", "Hydro / DWC"];

/** Läuft und ist nicht archiviert. */
export const isActiveGrow = (g: Pick<Grow, "status" | "archived">) => g.status === "active" && !g.archived;

export const conditionLabel: Record<GrowCondition, string> = { gesund: "Gesund", beobachten: "Beobachten", problem: "Problem" };
export const conditionTone: Record<GrowCondition, Tone> = { gesund: "leaf", beobachten: "warning", problem: "danger" };
export const conditionIcon: Record<GrowCondition, string> = { gesund: "HeartPulse", beobachten: "Eye", problem: "AlertTriangle" };
export const statusLabel: Record<GrowStatus, string> = { active: "Läuft", harvested: "Geerntet", aborted: "Abgebrochen" };

/** „1.234 g“ bzw. „–“. */
export const formatGrams = (grams: number | null | undefined) => (grams == null ? "–" : `${grams.toLocaleString("de-DE")} g`);

/** Ertrag je Pflanze ist nicht bekannt; Trockengewicht gegenüber Nassgewicht in Prozent (Verlust beim Trocknen). */
export const dryRatio = (wetG: number | null, dryG: number | null) => (wetG && dryG != null && wetG > 0 ? Math.round((dryG / wetG) * 100) : null);

/** JJJJ-MM-TT → „24.10.2026“ (ohne Zeitzonen-Verschiebung). */
export const formatDay = (iso: string | null | undefined) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "–";
};

/** Heutiges Datum lokal als JJJJ-MM-TT (für `max` in Datumsfeldern). */
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
