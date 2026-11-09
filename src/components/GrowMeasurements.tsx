import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, Segmented } from "@/components/ui";
import { EnvChart } from "@/components/EnvChart";
import { EnvModal } from "@/components/GrowDialogs";
import { VPD_BAND, formatDay, formatRange, outsideRange, rangeAlerts, shiftDay, todayLocal } from "@/lib/grows";
import type { EnvPoint, Grow } from "@/types";

type Range = "7" | "30" | "all";
const LIST_LIMIT = 8;

const n = (v: number | null, digits = 1) => (v == null ? "–" : v.toLocaleString("de-DE", { maximumFractionDigits: digits }));

/** Wert in der Liste; außerhalb des Zielbereichs rot mit Pfeil (und für Screenreader als Text). */
function Flagged({ dir, children }: { dir: "low" | "high" | null; children: React.ReactNode }) {
  if (!dir) return <span>{children}</span>;
  return (
    <span className="font-medium text-danger" data-out={dir}>
      {children} {dir === "high" ? "↑" : "↓"}<span className="sr-only"> {dir === "high" ? "über" : "unter"} dem Zielbereich</span>
    </span>
  );
}

/** Messwerte eines Grows (B-85): Diagramme (Temperatur + Feuchte, pH + EC, VPD mit Zielband) und Liste mit Bearbeiten. */
export function GrowMeasurements({ grow, onChanged }: { grow: Grow; onChanged: () => Promise<void> | void }) {
  const [range, setRange] = useState<Range>("all");
  const [dialog, setDialog] = useState<null | { date?: string }>(null);
  const [showAll, setShowAll] = useState(false);

  const today = todayLocal();
  const from = range === "all" ? undefined : shiftDay(today, -(Number(range) - 1));
  const to = range === "all" ? undefined : today;
  const points = useMemo<EnvPoint[]>(
    () => [...grow.env].filter((e) => !from || e.date >= from).sort((a, b) => a.date.localeCompare(b.date)),
    [grow.env, from],
  );
  const dates = points.map((p) => p.date);
  const col = (key: "temp" | "rh" | "ec" | "ph" | "vpd") => points.map((p) => p[key]);
  const list = [...grow.env].sort((a, b) => b.date.localeCompare(a.date));
  const alerts = rangeAlerts(grow.env, grow.targets);
  const shown = showAll ? list : list.slice(0, LIST_LIMIT);

  return (
    <>
      <Card className="p-5" data-testid="measurements">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Thermometer" size={16} /> Messwerte</h2>
            <p className="mt-0.5 text-xs text-fg-subtle">Ein Eintrag pro Tag · alle Werte optional · VPD wird berechnet</p>
          </div>
          <Button size="sm" onClick={() => setDialog({})} data-testid="add-env"><Icon name="Plus" size={15} /> Messwerte</Button>
        </div>
        {alerts.length > 0 && (
          <ul className="mb-4 space-y-1.5" data-testid="range-alerts" aria-label="Werte außerhalb des Zielbereichs">
            {alerts.map((a) => (
              <li key={a.key} data-alert={a.key} className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-fg">
                <Icon name="AlertTriangle" size={15} className="mt-0.5 shrink-0 text-danger" />
                <span>
                  <strong>{a.label} {a.value.toLocaleString("de-DE", { maximumFractionDigits: a.digits })}{a.unit ? ` ${a.unit}` : ""}</strong> am {formatDay(a.date)} liegt {a.direction === "high" ? "über" : "unter"} dem Zielbereich ({formatRange(a.range, a.unit)}).
                </span>
              </li>
            ))}
          </ul>
        )}
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[{ value: "7", label: "7 Tage" }, { value: "30", label: "30 Tage" }, { value: "all", label: "Alles" }]}
        />

        {grow.env.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-fg-muted">Noch keine Messwerte. Trage Temperatur, Luftfeuchte, EC oder pH ein – die Diagramme entstehen automatisch.</p>
        ) : (
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">Temperatur & Luftfeuchte</h3>
              <EnvChart
                testId="chart-climate"
                label="Verlauf von Temperatur und Luftfeuchte"
                dates={dates} from={from} to={to}
                series={[
                  { key: "temp", label: "Temperatur", unit: "°C", color: "var(--accent)", axis: "left", values: col("temp") },
                  { key: "rh", label: "Luftfeuchte", unit: "%", color: "var(--info)", axis: "right", values: col("rh"), digits: 0 },
                ]}
              />
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">pH & EC</h3>
              <EnvChart
                testId="chart-feed"
                label="Verlauf von pH und EC"
                dates={dates} from={from} to={to}
                bands={[
                  ...(grow.targets.ph ? [{ ...grow.targets.ph, label: `pH-Ziel ${formatRange(grow.targets.ph)}`, axis: "left" as const, seriesKey: "ph" }] : []),
                  ...(grow.targets.ec ? [{ ...grow.targets.ec, label: `EC-Ziel ${formatRange(grow.targets.ec, "mS")}`, axis: "right" as const, seriesKey: "ec" }] : []),
                ]}
                series={[
                  { key: "ph", label: "pH", unit: "", color: "var(--accent-2)", axis: "left", values: col("ph"), digits: 2 },
                  { key: "ec", label: "EC", unit: "mS", color: "var(--warning)", axis: "right", values: col("ec"), digits: 2 },
                ]}
              />
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-semibold">VPD <span className="font-normal text-fg-subtle">· Blatt-Abzug {String(grow.leafOffset).replace(".", ",")} °C</span></h3>
              <EnvChart
                testId="chart-vpd"
                label="Verlauf des VPD mit Zielbereich"
                dates={dates} from={from} to={to}
                bands={[{ ...VPD_BAND, label: `Ziel ${formatRange(VPD_BAND, "kPa")}`, seriesKey: "vpd" }]}
                height={170}
                series={[{ key: "vpd", label: "VPD", unit: "kPa", color: "var(--success)", axis: "left", values: col("vpd"), digits: 2 }]}
              />
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold">Einträge <span className="font-normal text-fg-subtle">({list.length})</span></h3>
              <ul className="divide-y divide-border rounded-xl border border-border" data-testid="env-list">
                {shown.map((e) => (
                  <li key={e.date} className="flex items-center gap-3 px-3 py-2.5" data-testid="env-row">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium tnum">{formatDay(e.date)} <span className="text-xs font-normal text-fg-subtle">· Tag {e.day}</span></div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted tnum">
                        <span>{n(e.temp)} °C</span><span>{n(e.rh, 0)} %</span>
                        <Flagged dir={outsideRange(e.vpd, VPD_BAND)}>VPD {n(e.vpd, 2)}</Flagged>
                        <Flagged dir={outsideRange(e.ec, grow.targets.ec)}>EC {n(e.ec, 2)}</Flagged>
                        <Flagged dir={outsideRange(e.ph, grow.targets.ph)}>pH {n(e.ph, 2)}</Flagged>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" aria-label={`Messwerte vom ${formatDay(e.date)} bearbeiten`} onClick={() => setDialog({ date: e.date })}><Icon name="Pencil" size={15} /></Button>
                  </li>
                ))}
              </ul>
              {list.length > LIST_LIMIT && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll((v) => !v)}>{showAll ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`}</Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {dialog && (
        <EnvModal
          key={dialog.date ?? "new"}
          grow={grow}
          initialDate={dialog.date}
          open
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void onChanged(); }}
        />
      )}
    </>
  );
}
