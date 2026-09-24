const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** Deutsche relative Zeitangabe (analog zur Frontend-`timeAgo`). */
export function ago(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (diff < HOUR) return "gerade eben";
  const hours = Math.floor(diff / HOUR);
  if (hours < 24) return hours === 1 ? "vor 1 Std." : `vor ${hours} Std.`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Mo.`;
  return `vor ${Math.floor(days / 365)} J.`;
}

/** Minuten-Auflösung für die Kurzzeit (nicht genutzt, aber bereit). */
export function minutesAgo(ms: number): number {
  return Math.max(0, Math.floor(ms / MIN));
}
