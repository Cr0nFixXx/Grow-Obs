import { useId } from "react";
import { cn } from "@/utils/cn";
import { clamp } from "@/lib/format";

interface Pt {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic bézier smoothing for organic curves. */
export function smooth(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export interface Series {
  name: string;
  color: string;
  data: number[];
}

/** Multi-series smooth area / line chart (non-scaling stroke → crisp at any width). */
export function SeriesChart({
  labels,
  series,
  height = 180,
  area = true,
  className,
}: {
  labels?: string[];
  series: Series[];
  height?: number;
  area?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const W = 100;
  const padT = 10;
  const padB = 10;
  const H = height;
  const all = series.flatMap((s) => s.data);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const range = max - min || 1;

  const toPts = (data: number[]): Pt[] =>
    data.map((v, i) => ({
      x: data.length === 1 ? W / 2 : (i / (data.length - 1)) * W,
      y: H - padB - ((v - min) / range) * (H - padT - padB),
    }));

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`g-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line
            key={i}
            x1="0"
            x2={W}
            y1={padT + g * (H - padT - padB)}
            y2={padT + g * (H - padT - padB)}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2 5"
          />
        ))}
        {series.map((s, i) => {
          const pts = toPts(s.data);
          const line = smooth(pts);
          const fill = area ? `${line} L ${W} ${H - padB} L 0 ${H - padB} Z` : "";
          return (
            <g key={i}>
              {area && <path d={fill} fill={`url(#g-${uid}-${i})`} />}
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>
      {labels && (
        <div className="mt-2 flex justify-between text-[10px] text-fg-subtle">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny inline trend line. */
export function Sparkline({
  data,
  color = "var(--accent)",
  height = 36,
  className,
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const W = 100;
  if (data.length === 0) return <div style={{ height }} className={cn("w-full", className)} aria-hidden />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const denom = data.length - 1 || 1;
  const pts = data.map((v, i) => ({
    x: (i / denom) * W,
    y: height - 3 - ((v - min) / range) * (height - 6),
  }));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={cn("w-full", className)} style={{ height }}>
      <path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/** Radial progress gauge. */
export function Gauge({
  value,
  max = 100,
  size = 120,
  stroke = 10,
  color = "var(--accent)",
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp(value / max, 0, 1);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1.1s var(--ease-spring)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Donut / composition chart. */
export function Donut({
  data,
  size = 140,
  stroke = 16,
  children,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray 0.8s var(--ease-spring)" }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/** Crisp CSS bar chart. */
export function Bars({
  data,
  height = 180,
  className,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  className?: string;
}) {
  if (data.length === 0) return <div style={{ height }} className={className} aria-hidden />;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className={cn("flex flex-col", className)} style={{ height }}>
      <div className="flex flex-1 items-end gap-2">
        {data.map((d, i) => (
          <div key={i} className="group flex-1" title={`${d.label}: ${d.value}`}>
            <div
              className="w-full rounded-t-md transition-all duration-700 ease-out group-hover:brightness-110"
              style={{ height: `${(d.value / max) * 100}%`, background: d.color ?? "var(--accent)", minHeight: 4 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-fg-subtle">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
