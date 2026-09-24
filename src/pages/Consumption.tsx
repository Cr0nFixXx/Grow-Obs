import { useState } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Badge, Card, PageHeader, Segmented } from "@/components/ui";
import { Bars, SeriesChart } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { consumptionCompare, consumptionSeries } from "@/mocks/data";
import { eur, n } from "@/lib/format";

export default function Consumption() {
  const [tab, setTab] = useState<"timeline" | "compare" | "forecast">("timeline");
  const labels = consumptionSeries.map((c) => c.label);

  const totalCost = consumptionSeries.reduce((s, c) => s + c.kosten, 0);
  const totalStrom = consumptionSeries.reduce((s, c) => s + c.strom, 0);
  const avg = totalCost / consumptionSeries.length;

  const kpis = [
    { label: "Kosten / Jahr", value: eur(totalCost), icon: "Euro", tone: "leaf" },
    { label: "Strom / Jahr", value: `${n(totalStrom)} kWh`, icon: "Zap", tone: "warning" },
    { label: "Ø / Monat", value: eur(avg), icon: "ChartColumn", tone: "info" },
    { label: "Einsparung", value: "−12 %", icon: "TrendingDown", tone: "soil" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Verbrauchsübersicht" subtitle="Strom, Wasser & Kosten im Überblick – inkl. Community-Vergleich." icon="ChartColumn"
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: "timeline", label: "Verlauf" }, { value: "compare", label: "Vergleich" }, { value: "forecast", label: "Prognose" }]} />} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <Reveal key={k.label} delay={i * 0.04}>
            <Card className="p-4">
              <span className={cn("grid size-9 place-items-center rounded-lg", k.tone === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : k.tone === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : k.tone === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : "bg-warning-500/12 text-warning-500 dark:text-warning-400")}>
                <Icon name={k.icon} size={17} />
              </span>
              <div className="mt-2.5 text-xl font-bold tnum">{k.value}</div>
              <div className="text-xs text-fg-subtle">{k.label}</div>
            </Card>
          </Reveal>
        ))}
      </div>

      {tab === "timeline" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Activity" size={16} /> Verlauf 12 Monate</h2>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--accent)]" /> Strom</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--info)]" /> Wasser</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--warning)]" /> Kosten</span>
              </div>
            </div>
            <SeriesChart height={240} labels={labels} series={[
              { name: "Strom", color: "var(--accent)", data: consumptionSeries.map((c) => c.strom) },
              { name: "Wasser", color: "var(--info)", data: consumptionSeries.map((c) => c.wasser) },
              { name: "Kosten", color: "var(--warning)", data: consumptionSeries.map((c) => c.kosten) },
            ]} />
          </Card>
        </Reveal>
      )}

      {tab === "compare" && (
        <Reveal>
          <Card className="space-y-5 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Scale" size={16} /> Du vs. Community</h2>
            {[
              { label: "Strom (kWh/Mo.)", you: consumptionCompare[0].strom, comm: consumptionCompare[1].strom, color: "var(--accent)" },
              { label: "Wasser (L/Mo.)", you: consumptionCompare[0].wasser, comm: consumptionCompare[1].wasser, color: "var(--info)" },
              { label: "Kosten (€/Mo.)", you: consumptionCompare[0].kosten, comm: consumptionCompare[1].kosten, color: "var(--warning)" },
            ].map((m) => {
              const max = Math.max(m.you, m.comm);
              return (
                <div key={m.label}>
                  <div className="mb-2 text-sm font-medium">{m.label}</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3 text-xs"><span className="w-20 text-fg-muted">Du</span><div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(m.you / max) * 100}%`, background: m.color }} /></div><span className="w-12 text-right font-semibold tnum">{m.you}</span></div>
                    <div className="flex items-center gap-3 text-xs"><span className="w-20 text-fg-muted">Community</span><div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-fg-subtle" style={{ width: `${(m.comm / max) * 100}%` }} /></div><span className="w-12 text-right font-semibold tnum">{m.comm}</span></div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-start gap-2 rounded-xl bg-leaf-500/10 p-3 text-sm text-leaf-700 dark:text-leaf-300"><Icon name="Trophy" size={15} className="mt-0.5 shrink-0" /><span>Du liegst bei allen Werten unter dem Community-Schnitt. Top!</span></div>
          </Card>
        </Reveal>
      )}

      {tab === "forecast" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="TrendingUp" size={16} /> Prognose nächste 6 Monate</h2>
              <Badge tone="leaf">−8 % erwartet</Badge>
            </div>
            <Bars height={220} data={["Jul", "Aug", "Sep", "Okt", "Nov", "Dez"].map((l, i) => ({ label: l, value: Math.round(160 - i * 4 + Math.sin(i) * 8), color: "var(--accent)" }))} />
          </Card>
        </Reveal>
      )}
    </div>
  );
}
