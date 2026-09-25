/**
 * Update-Entscheidungen (B-50), rein und testbar.
 *
 * - Update verfügbar: Server-Build ≠ eigener Build.
 * - Pflicht-Update: verfügbar UND es gibt ein `required`-Release, das NACH dem eigenen Build erschien.
 * - Neuigkeiten: Releases, die nach dem zuletzt gesehenen Zeitpunkt veröffentlicht wurden.
 */
export type UpdateMode = "auto" | "prompt" | "manual";
export type ReleaseSeverity = "optional" | "recommended" | "required";

export interface Release {
  id: string;
  version: string;
  title: string;
  notes: string[];
  severity: ReleaseSeverity;
  features: string[];
  publishedAt: string;
}

export interface UpdatePrefs {
  mode: UpdateMode;
  /** „Was ist neu“ nach Updates / neuen Ankündigungen automatisch zeigen. */
  showWhatsNew: boolean;
}

export const DEFAULT_PREFS: UpdatePrefs = { mode: "prompt", showWhatsNew: true };

export function parsePrefs(raw: unknown): UpdatePrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === "auto" || r.mode === "manual" || r.mode === "prompt" ? r.mode : DEFAULT_PREFS.mode,
    showWhatsNew: typeof r.showWhatsNew === "boolean" ? r.showWhatsNew : DEFAULT_PREFS.showWhatsNew,
  };
}

export function computeUpdate(input: { clientBuild: string; clientBuiltAt: string; serverBuild: string | null; releases: Release[] }) {
  const available = !!input.serverBuild && input.serverBuild !== "dev" && input.clientBuild !== "dev" && input.serverBuild !== input.clientBuild;
  const builtAt = Date.parse(input.clientBuiltAt) || 0;
  const required = input.releases.find((r) => r.severity === "required" && Date.parse(r.publishedAt) > builtAt);
  return { available, mandatory: available && !!required, requiredRelease: available ? required ?? null : null };
}

/** Neu seit `seenAt` (ISO). Ohne `seenAt` (Erststart) → nichts, damit neue Nutzer keine Altlasten sehen. */
export function unseenReleases(releases: Release[], seenAt: string | null): Release[] {
  if (!seenAt) return [];
  const since = Date.parse(seenAt) || 0;
  return releases.filter((r) => Date.parse(r.publishedAt) > since).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** Was tun, wenn ein (nicht verpflichtendes) Update verfügbar ist? */
export function updateAction(mode: UpdateMode, context: { visible: boolean; justStarted: boolean }): "apply" | "banner" | "badge" {
  if (mode === "auto") return !context.visible || context.justStarted ? "apply" : "badge";
  if (mode === "prompt") return "banner";
  return "badge";
}
