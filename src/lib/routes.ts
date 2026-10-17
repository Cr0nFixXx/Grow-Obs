import type { NavParams, ViewKey } from "@/lib/nav";

/**
 * URL-Schema der App (B-57). Reine Funktionen, unabhängig vom Browser → leicht testbar.
 *
 *   /                      Dashboard            /grows/<growId>        Grow-Detail
 *   /forum/<threadId>      Forum-Thread         /wiki/<articleId>      Wiki-Artikel
 *   /breeders/<breederId>  Breeder              /communities/<id>      Community
 *   /strains/<strainId>    Sorte (Detail)
 *   /profile/settings      Profil-Tab           /hall-of-fame, …       übrige Hauptansichten
 *
 * Nicht verlinkbar (URL bleibt „/“): Anmeldung, Dev-Admin, Erstellen-Assistent.
 * Unbekannte Pfade (`parsePath` → `null`) zeigen die 404-Seite (B-62): serverseitig mit HTTP 404, in der App als Ansicht „notFound“.
 */
const SEGMENT: Partial<Record<ViewKey, string>> = {
  dashboard: "", grows: "grows", strains: "strains", ai: "ai", planner: "planner", breeders: "breeders",
  marketplace: "marketplace", wiki: "wiki", forum: "forum", hallOfFame: "hall-of-fame", social: "social",
  communities: "communities", showcase: "showcase", calculator: "calculator", consumption: "consumption",
  simulation: "simulation", report: "report", chat: "chat", notifications: "notifications", profile: "profile",
  telegram: "telegram",
};
/** Welcher Parameter steht als zweites Pfadsegment? */
const DETAIL_PARAM: Partial<Record<ViewKey, string>> = {
  grows: "growId", strains: "strainId", breeders: "breederId", wiki: "articleId", forum: "threadId", communities: "id", profile: "tab",
};
const VIEW_BY_SEGMENT = new Map<string, ViewKey>(
  (Object.entries(SEGMENT) as [ViewKey, string][]).filter(([, s]) => s).map(([view, s]) => [s, view]),
);
const PROFILE_TABS = new Set(["profil", "settings"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const isLinkable = (view: ViewKey) => view in SEGMENT;

/** Pfad für eine Ansicht; nicht verlinkbare Ansichten liefern „/“. */
export function pathFor(view: ViewKey, params?: NavParams | null): string {
  const segment = SEGMENT[view];
  if (segment === undefined || segment === "") return "/";
  const key = DETAIL_PARAM[view];
  const detail = key ? params?.[key] : undefined;
  if (detail && SAFE_ID.test(detail) && (key !== "tab" || PROFILE_TABS.has(detail))) return `/${segment}/${detail}`;
  return `/${segment}`;
}

/** Ansicht aus einem Pfad; `null` bei unbekanntem Pfad (404-Seite). */
export function parsePath(pathname: string): { view: ViewKey; params: NavParams | null } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { view: "dashboard", params: null };
  const view = VIEW_BY_SEGMENT.get(parts[0]!);
  if (!view || parts.length > 2) return null;
  const key = DETAIL_PARAM[view];
  const detail = parts[1];
  if (detail === undefined) return { view, params: null };
  if (!key || !SAFE_ID.test(detail) || (key === "tab" && !PROFILE_TABS.has(detail))) return null;
  return { view, params: { [key]: detail } };
}

/** Alte Deep-Links `/?view=social` → Ansicht (nur verlinkbare, ohne Detail). */
export function parseLegacyQuery(search: string): ViewKey | null {
  const requested = new URLSearchParams(search).get("view") as ViewKey | null;
  return requested && isLinkable(requested) ? requested : null;
}

/** Vollständiger, teilbarer Link (`origin` + Pfad). Im Vite-Legacy-Build ohne Server-Routing: `/?view=…`. */
export function shareUrl(origin: string, view: ViewKey, params: NavParams | null | undefined, pathRouting: boolean, hash = ""): string {
  if (pathRouting) return `${origin}${pathFor(view, params)}${hash}`;
  return `${origin}/?view=${view}${hash}`;
}
