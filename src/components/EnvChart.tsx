import { useEffect, useRef, useState } from "react";
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

export interface EnvBand { min: number; max: number; label: string }

const DAY_MS = 86_400_000;
const toTime = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : 0;
};
const shortDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const fmt = (v: number, digits = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits });
/** Linien reißen ab, wenn zwischen zwei Messwerten mehr als so viele Tage liegen. */
const MAX_GAP_DAYS = 7;

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
 * Messwert-Diagramm nach Datum (B-85): Zeitachse mit echten Abständen, ein Punkt je Tag,
 * Lücken bei fehlenden Werten, linke und rechte Skala, optionales Zielband.
 * Tippen/Hovern wählt den nächsten Tag; die Werte stehen dann über dem Diagramm.
 */
export function EnvChart({
  dates, series, from, to, band, height = 190, label, className, testId,
}: {
  dates: string[];
  series: EnvSeries[];
  from?: string;
  to?: string;
  band?: EnvBand;
  height?: number;
  label: string;
  className?: string;
  testId?: string;
}) {
  const [wrap, width] = useWidth();
  const [picked, setPicked] = useState<number | null>(null);

  const visible = series.filter((s) => s.values.some((v) => v !== null));
  const t0 = toTime(from ?? dates[0] ?? "");
  const t1Raw = toTime(to ?? dates[dates.length - 1] ?? "");
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
    if (band && axis === "left") vals.push(band.min, band.max);
    if (!vals.length) return null;
    return niceScale(Math.min(...vals), Math.max(...vals));
  };
  const scales = { left: scaleFor("left"), right: scaleFor("right") };
  const y = (axis: "left" | "right", v: number) => {
    const sc = scales[axis]!;
    return padT + innerH - ((v - sc.min) / (sc.max - sc.min)) * innerH;
  };

  const hasData = visible.length > 0;
  const primary = scales.left ?? scales.right;
  const tickCount = Math.min(5, Math.max(2, Math.floor(innerW / 70)));
  const xTicks: string[] = Array.from({ length: tickCount }, (_unused, i) => new Date(t0 + ((t1 - t0) * i) / (tickCount - 1)).toISOString().slice(0, 10));

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
  const pickedValues: { s: EnvSeries; v: number }[] = [];
  if (picked !== null) for (const s of visible) { const v = s.values[picked]; if (v !== null && v !== undefined) pickedValues.push({ s, v }); }

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <div className="mb-2 flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {visible.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {band && <span className="inline-flex items-center gap-1.5 text-fg-muted"><span className="h-2 w-3 rounded-sm bg-accent/25" />{band.label}</span>}
      </div>
      <div aria-live="polite" className="mb-1 min-h-[18px] text-[12px] text-fg" data-testid={testId ? `${testId}-tip` : undefined}>
        {pickedDate && (
          <>
            <strong>{formatDay(pickedDate)}</strong>
            {pickedValues.map(({ s, v }) => <span key={s.key} className="ml-3 tabular-nums" style={{ color: s.color }}>{s.label} {fmt(v, s.digits)} {s.unit}</span>)}
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
            {band && scales.left && (
              <rect x={padL} width={innerW} y={y("left", band.max)} height={Math.max(0, y("left", band.min) - y("left", band.max))} fill="var(--accent)" opacity="0.14" />
            )}
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
            {pickedDate && <line x1={x(pickedDate)} x2={x(pickedDate)} y1={padT} y2={padT + innerH} stroke="var(--fg-muted)" strokeDasharray="3 3" />}
            {visible.map((s) => {
              const pts = s.values.map((v, i) => (v === null || !dates[i] ? null : { x: x(dates[i]!), y: y(s.axis, v), t: toTime(dates[i]!) })).filter((p): p is { x: number; y: number; t: number } => p !== null);
              let path = "";
              pts.forEach((p, i) => {
                const prev = pts[i - 1];
                path += prev && (p.t - prev.t) / DAY_MS <= MAX_GAP_DAYS ? ` L ${p.x} ${p.y}` : `${path ? " " : ""}M ${p.x} ${p.y}`;
              });
              return (
                <g key={s.key} data-series={s.key}>
                  <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((p) => <circle key={p.t} cx={p.x} cy={p.y} r={pickedDate && toTime(pickedDate) === p.t ? 4.5 : 3} fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border text-[13px] text-fg-muted" style={{ height }}>Keine Messwerte im Zeitraum</div>
        )}
      </div>
    </div>
  );
}
