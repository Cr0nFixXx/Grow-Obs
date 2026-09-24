/** Small, dependency-free formatting helpers (German locale). */

const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurFormatter2 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFormatter = new Intl.NumberFormat("de-DE");

export function eur(value: number, decimals = false): string {
  return decimals ? eurFormatter2.format(value) : eurFormatter.format(value);
}

export function n(value: number): string {
  return numFormatter.format(value);
}

export function compact(value: number): string {
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

export function pct(value: number, digits = 0): string {
  return `${value.toFixed(digits).replace(".", ",")} %`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const MS_DAY = 1000 * 60 * 60 * 24;

/** Human "time ago" in German. */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / MS_DAY);
  if (days <= 0) {
    const hours = Math.floor(diff / (MS_DAY / 24));
    if (hours <= 0) return "gerade eben";
    if (hours === 1) return "vor 1 Std.";
    return `vor ${hours} Std.`;
  }
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Mo.`;
  return `vor ${Math.floor(days / 365)} J.`;
}

/** Light haptic feedback if the device supports the Vibration API. */
export function vibrate(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
