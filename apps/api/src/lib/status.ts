import { and, eq, inArray, lt, isNotNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { follows, users } from "../db/schema.ts";
import { releaseMedia } from "./media-cleanup.ts";

/** Livestatus (B-97): Textstatus (dauerhaft, eine Zeile mit Emoji) und 24h-Status (Text, optional Foto). */
export const STATUS_TEXT_MAX = 80;
export const STATUS_EMOJI_MAX = 8;
export const LIVE_TEXT_MAX = 140;
export const LIVE_HOURS = 24;
export const STATUS_VISIBILITIES = ["all", "followers", "nobody"] as const;
export type StatusVisibility = (typeof STATUS_VISIBILITIES)[number];

export interface StatusRow {
  id: string;
  profileVisibility: string;
  statusEmoji: string;
  statusText: string;
  statusVisibility: string;
  liveText: string;
  liveImage: string | null;
  liveVisibility: string;
  liveExpiresAt: Date | null;
}

export const statusColumns = {
  id: users.id, profileVisibility: users.profileVisibility, statusEmoji: users.statusEmoji, statusText: users.statusText,
  statusVisibility: users.statusVisibility, liveText: users.liveText, liveImage: users.liveImage,
  liveVisibility: users.liveVisibility, liveExpiresAt: users.liveExpiresAt,
};

/** Wer darf einen Status sehen? Voraussetzung ist immer, dass der Betrachter das Profil sehen darf; dazu die Einstellung des Status. */
export function statusAllowed(viewer: { id: string; follows: boolean }, owner: { id: string; profileVisibility: string }, visibility: string): boolean {
  if (viewer.id === owner.id) return true;
  if (owner.profileVisibility === "nobody") return false;
  if (owner.profileVisibility === "followers" && !viewer.follows) return false;
  if (visibility === "nobody") return false;
  if (visibility === "followers") return viewer.follows;
  return true;
}

export interface StatusLineDto { emoji: string; text: string }
export interface LiveStatusDto { text: string; image: string; expiresAt: string; visibility: StatusVisibility }

export const liveActive = (row: Pick<StatusRow, "liveText" | "liveImage" | "liveExpiresAt">, now = new Date()) =>
  row.liveExpiresAt !== null && row.liveExpiresAt.getTime() > now.getTime() && (row.liveText !== "" || row.liveImage !== null);

export const lineOf = (row: Pick<StatusRow, "statusEmoji" | "statusText">): StatusLineDto | null =>
  row.statusText === "" && row.statusEmoji === "" ? null : { emoji: row.statusEmoji, text: row.statusText };

export const liveOf = (row: StatusRow, now = new Date()): LiveStatusDto | null =>
  liveActive(row, now) ? { text: row.liveText, image: row.liveImage ?? "", expiresAt: row.liveExpiresAt!.toISOString(), visibility: row.liveVisibility as StatusVisibility } : null;

/** Eigener Status (immer sichtbar), samt Einstellungen. */
export function ownStatus(row: StatusRow, now = new Date()) {
  return { status: { emoji: row.statusEmoji, text: row.statusText, visibility: row.statusVisibility as StatusVisibility }, live: liveOf(row, now) };
}

/** Status für fremde Betrachter; leere/abgelaufene/nicht erlaubte Teile fehlen (`null`). */
export function visibleStatus(row: StatusRow, viewer: { id: string; follows: boolean }, now = new Date()): { status: StatusLineDto | null; live: LiveStatusDto | null } {
  const line = statusAllowed(viewer, row, row.statusVisibility) ? lineOf(row) : null;
  const live = statusAllowed(viewer, row, row.liveVisibility) ? liveOf(row, now) : null;
  if (viewer.id === row.id) return { status: lineOf(row), live: liveOf(row, now) };
  return { status: line, live };
}

/** Stapelabfrage: Status mehrerer Personen für einen Betrachter. Ergebnis je Person-ID. */
export async function statusesFor(viewerId: string, ids: string[]): Promise<Map<string, { status: StatusLineDto | null; live: LiveStatusDto | null }>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, { status: StatusLineDto | null; live: LiveStatusDto | null }>();
  if (!unique.length) return result;
  const [rows, rel] = await Promise.all([
    db.select(statusColumns).from(users).where(inArray(users.id, unique)),
    db.select({ id: follows.followeeId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted"), inArray(follows.followeeId, unique))),
  ]);
  const following = new Set(rel.map((r) => r.id));
  for (const row of rows) result.set(row.id, visibleStatus(row, { id: viewerId, follows: following.has(row.id) }));
  return result;
}

/** Abgelaufene 24h-Status leeren und deren Fotos (Zeile und Objekt) entfernen. Aufruf aus dem Aufräum-Cron. */
export async function expireLiveStatuses(): Promise<{ expired: number }> {
  const due = await db.select({ id: users.id, image: users.liveImage }).from(users)
    .where(and(isNotNull(users.liveExpiresAt), lt(users.liveExpiresAt, new Date())));
  if (!due.length) return { expired: 0 };
  await db.update(users).set({ liveText: "", liveImage: null, liveExpiresAt: null }).where(inArray(users.id, due.map((d) => d.id)));
  for (const d of due) if (d.image) await releaseMedia(d.id, d.image);
  return { expired: due.length };
}
