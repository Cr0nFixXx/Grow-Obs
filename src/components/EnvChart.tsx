import { useEffect, useId, useRef, useState } from "react";
import { smooth } from "@/components/charts";
import { formatDay } from "@/lib/grows";
import { cn } from "@/utils/cn";

export interface EnvSeries {
  key: string;
  label: string;
  unit: string;
  color: string;
  /** Skala, an der die Linie hängt (links/rechts). */
  axis: "left" | "right";
  /** Ein Wert je Eintrag in `dates`; `null` = kein Messwert. */
  values: (number | null)[];
  digits?: number;
}

/**
 * Zielband; `seriesKey` markiert Punkte dieser Reihe außerhalb des Bands.
 * Mit `steps` ändert sich der Bereich je Phase: ab dem Datum `from` gilt `range` (`null` = in diesem Abschnitt kein Band); `min`/`max` dienen dann nur als Rückfall.
 */
export interface EnvBand { min: number; max: number; label: string; axis?: "left" | "right"; seriesKey?: string; steps?: { from: string; range: { min: number; max: number } | null }[] }

const DAY_MS = 86_400_000;
const toTime = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : 0;
};
const shortDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const fmt = (v: number, digits = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits });
/** Bereich des Bands an einem Tag (nach Zeit `t`); mit Abschnitten der des letzten Abschnitts, der begonnen hat. */
function bandRangeAt(b: EnvBand, t: number): { min: number; max: number } | null {
  if (!b.steps?.length) return { min: b.min, max: b.max };
  let hit = b.steps[0]!;
  for (const step of b.steps) if (toTime(step.from) <= t) hit = step;
  return hit.range;
}
/** Bis zu dieser Zahl an Punkten je Reihe werden alle Punkte gezeichnet; darüber nur Werte außerhalb des Ziels und der gewählte. */
const MAX_DOTS = 14;

/** Rundet die Skala auf „schöne“ Grenzen. */
function niceScale(min: number, max: number): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { min: lo, max: hi, ticks };
}

function useWidth(fallback = 320) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth || fallback);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/**
 * Messwert-Diagramm nach Datum (B-85/B-86): Zeitachse mit echten Abständen, weiche Kurven ohne Überschwingen,
 * sanfter Flächenverlauf, Lücken bei fehlenden Werten, linke und rechte Skala, Zielbänder (Punkte außerhalb
 * werden rot markiert). Tippen/Hovern wählt den nächsten Tag; die Werte stehen dann über dem Diagramm.
 */
export function EnvChart({
  dates, series, from, to, bands, height = 190, label, className, testId,
}: {
  dates: string[];
  series: EnvSeries[];
  from?: string;
  to?: string;
  bands?: EnvBand[];
  height?: number;
  label: string;
  className?: string;
  testId?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const [wrap, width] = useWidth();
  const [picked, setPicked] = useState<number | null>(null);

  const visible = series.filter((s) => s.values.some((v) => v !== null));
  const activeBands = (bands ?? []).filter((b) => !b.seriesKey || visible.some((s) => s.key === b.seriesKey));
  // Ohne feste Grenzen (Zeitraum „Alles“) reicht die Achse vom ersten bis zum letzten Tag, an dem DIESES Diagramm einen Wert hat –
  // sonst bliebe z. B. ein pH/EC-Diagramm rechts leer, weil an späteren Tagen nur Temperatur gemessen wurde.
  const valued = dates.filter((_d, i) => visible.some((s) => s.values[i] != null));
  const t0 = toTime(from ?? valued[0] ?? "");
  const t1Raw = toTime(to ?? valued[valued.length - 1] ?? "");
  const t1 = t1Raw > t0 ? t1Raw : t0 + DAY_MS;

  const hasRight = visible.some((s) => s.axis === "right");
  const padL = 36;
  const padR = hasRight ? 36 : 12;
  const padT = 8;
  const padB = 22;
  const innerW = Math.max(40, width - padL - padR);
  const innerH = height - padT - padB;
  const x = (iso: string) => padL + ((toTime(iso) - t0) / (t1 - t0)) * innerW;

  const scaleFor = (axis: "left" | "right") => {
    const group = visible.filter((s) => s.axis === axis);
    const vals = group.flatMap((s) => s.values.filter((v): v is number => v !== null));
    for (const b of activeBands) if ((b.axis ?? "left") === axis) for (const r of b.steps?.length ? b.steps.map((st) => st.range) : [{ min: b.min, max: b.max }]) if (r) vals.push(r.min, r.max);
    if (!vals.length) return null;
    return niceScale(Math.min(...vals), Math.max(...vals));
  };
  const scales = { left: scaleFor("left"), right: scaleFor("right") };
  const y = (axis: "left" | "right", v: number) => {
    const sc = scales[axis]!;
    return padT + innerH - ((v - sc.min) / (sc.max - sc.min)) * innerH;
  };
  const baseY = padT + innerH;

  const bandFor = (key: string) => activeBands.find((b) => b.seriesKey === key);
  const flag = (key: string, v: number, t: number): "low" | "high" | null => {
    const b = bandFor(key);
    const r = b ? bandRangeAt(b, t) : null;
    return !r ? null : v < r.min ? "low" : v > r.max ? "high" : null;
  };

  type Dot = { x: number; y: number; t: number; v: number };
  const pointsOf = (s: EnvSeries): Dot[] =>
    s.values.map((v, i) => (v === null || !dates[i] ? null : { x: x(dates[i]!), y: y(s.axis, v), t: toTime(dates[i]!), v })).filter((p): p is Dot => p !== null);

  const hasData = visible.length > 0;
  const primary = scales.left ?? scales.right;
  const tickCount = Math.min(5, Math.max(2, Math.floor(innerW / 70)));
  // Bei kurzem Zeitraum (z. B. ein einzelner Tag) fallen Beschriftungen auf dasselbe Datum – nur einmal zeigen.
  const xTicks: string[] = [...new Set(Array.from({ length: tickCount }, (_unused, i) => new Date(t0 + ((t1 - t0) * i) / (tickCount - 1)).toISOString().slice(0, 10)))];

  const pick = (clientX: number, rect: DOMRect) => {
    if (!dates.length) return;
    const px = clientX - rect.left;
    let best = 0;
    let dist = Infinity;
    dates.forEach((d, i) => {
      const delta = Math.abs(x(d) - px);
      if (delta < dist) { dist = delta; best = i; }
    });
    setPicked(best);
  };

  const pickedDate = picked !== null ? dates[picked] : undefined;
  const pickedValues: { s: EnvSeries; v: number; flag: "low" | "high" | null }[] = [];
  if (picked !== null) for (const s of visible) { const v = s.values[picked]; if (v !== null && v !== undefined) pickedValues.push({ s, v, flag: flag(s.key, v, toTime(dates[picked]!)) }); }

  /** Ändert sich der Datenstand, läuft die Einblend-Animation neu (nicht bei Größenänderung oder Antippen). */
  const dataKey = `${from ?? ""}|${to ?? ""}|${dates.join(",")}|${visible.map((s) => s.values.join(",")).join(";")}`;

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <div className="mb-2 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {visible.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {activeBands.map((b) => {
          const color = visible.find((s) => s.key === b.seriesKey)?.color ?? "var(--accent)";
          return <span key={b.label} className="inline-flex items-center gap-1.5 text-fg-muted"><span className="h-2 w-3 rounded-sm" style={{ background: color, opacity: 0.35 }} />{b.label}</span>;
        })}
      </div>
      <div aria-live="polite" className="mb-1 min-h-[18px] text-[12px] text-fg" data-testid={testId ? `${testId}-tip` : undefined}>
        {pickedDate && (
          <>
            <strong>{formatDay(pickedDate)}</strong>
            {pickedValues.map(({ s, v, flag: f }) => (
              <span key={s.key} className="ml-3 tabular-nums" style={{ color: f ? "var(--danger)" : s.color }} data-flag={f ?? undefined}>
                {s.label} {fmt(v, s.digits)} {s.unit}{f ? (f === "high" ? " ↑ zu hoch" : " ↓ zu niedrig") : ""}
              </span>
            ))}
          </>
        )}
      </div>
      <div ref={wrap} className="w-full">
        {hasData && primary ? (
          <svg
            role="img"
            aria-label={label}
            width={width}
            height={height}
            className="touch-pan-y select-none"
            onPointerMove={(e) => { if (e.pointerType === "mouse") pick(e.clientX, e.currentTarget.getBoundingClientRect()); }}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setPicked(null)}
          >
            <defs>
              {visible.map((s) => (
                <linearGradient key={s.key} id={`env-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {activeBands.map((b) => {
              const axis = b.axis ?? "left";
              if (!scales[axis]) return null;
              const color = visible.find((s) => s.key === b.seriesKey)?.color ?? "var(--accent)";
              const parts = b.steps?.length
                ? b.steps.map((st, i) => ({ from: Math.max(t0, toTime(st.from)), to: Math.min(t1, i + 1 < b.steps!.length ? toTime(b.steps![i + 1]!.from) : t1), range: st.range }))
                : [{ from: t0, to: t1, range: { min: b.min, max: b.max } }];
              return (
                <g key={b.label}>
                  {parts.filter((part) => part.range && part.to > part.from).map((part) => {
                    const r = part.range!;
                    const xa = padL + ((part.from - t0) / (t1 - t0)) * innerW;
                    const xb = padL + ((part.to - t0) / (t1 - t0)) * innerW;
                    return <rect key={`${part.from}`} data-band={b.seriesKey ?? "band"} x={xa} width={Math.max(0, xb - xa)} y={y(axis, r.max)} height={Math.max(0, y(axis, r.min) - y(axis, r.max))} rx="4" fill={color} opacity="0.14" />;
                  })}
                </g>
              );
            })}
            {primary.ticks.map((t) => {
              const yy = padT + innerH - ((t - primary.min) / (primary.max - primary.min)) * innerH;
              return <line key={t} x1={padL} x2={padL + innerW} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray="2 5" />;
            })}
            {scales.left && scales.left.ticks.map((t) => (
              <text key={`l${t}`} x={padL - 6} y={y("left", t) + 4} textAnchor="end" fontSize="10" fill="var(--fg-muted)">{fmt(t, 2)}</text>
            ))}
            {scales.right && scales.right.ticks.map((t) => (
              <text key={`r${t}`} x={padL + innerW + 6} y={y("right", t) + 4} textAnchor="start" fontSize="10" fill="var(--fg-muted)">{fmt(t, 2)}</text>
            ))}
            {xTicks.map((d, i) => (
              <text key={d} x={x(d)} y={height - 6} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--fg-muted)">{shortDay(d)}</text>
            ))}
            <line
              x1={0} x2={0} y1={padT} y2={baseY} stroke="var(--fg-muted)" strokeDasharray="3 3"
              style={{ transform: `translateX(${pickedDate ? x(pickedDate) : padL}px)`, transition: "transform 140ms ease-out, opacity 120ms", opacity: pickedDate ? 1 : 0 }}
            />
            <g key={dataKey} className="chart-reveal">
              {visible.map((s) => {
                const pts = pointsOf(s);
                // Fehlende Tage werden überbrückt: eine durchgehende Kurve durch alle Messpunkte (Punkte = echte Messungen).
                const area = pts.length > 1 ? `${smooth(pts)} L ${pts[pts.length - 1]!.x} ${baseY} L ${pts[0]!.x} ${baseY} Z` : "";
                return <path key={`a-${s.key}`} data-area={s.key} d={area} fill={`url(#env-${uid}-${s.key})`} />;
              })}
              {visible.map((s) => {
                const pts = pointsOf(s);
                const path = smooth(pts);
                const pickedT = pickedDate ? toTime(pickedDate) : null;
                const dots = pts.filter((p) => pts.length <= MAX_DOTS || p.t === pickedT || flag(s.key, p.v, p.t) !== null);
                return (
                  <g key={s.key} data-series={s.key}>
                    <path d={path} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {dots.map((p) => {
                      const out = flag(s.key, p.v, p.t);
                      const active = pickedT === p.t;
                      const color = out ? "var(--danger)" : s.color;
                      return (
                        <circle
                          key={p.t} className="chart-dot" data-out={out ?? undefined}
                          cx={p.x} cy={p.y} r={active ? 5 : out ? 4 : 3.25}
                          fill={out ? color : "var(--surface)"} stroke={color} strokeWidth="2"
                          style={{ animationDelay: `${Math.round(((p.x - padL) / innerW) * 900)}ms`, transition: "r 120ms ease-out" }}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border text-[13px] text-fg-muted" style={{ height }}>Keine Messwerte im Zeitraum</div>
        )}
      </div>
    </div>
  );
}
