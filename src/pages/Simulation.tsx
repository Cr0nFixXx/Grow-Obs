import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, PageHeader, Slider } from "@/components/ui";
import { SeriesChart } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { forecastPhases } from "@/mocks/data";

const plan = [
  { icon: "Home", title: "Setup", text: "1,2 m² Zelt, 480 W LED, aktive Lüftung", tone: "leaf" },
  { icon: "Sprout", title: "Keimung (Tag 0–5)", text: "22–26 °C, 70 % Feuchte, dunkel-keimen", tone: "info" },
  { icon: "Activity", title: "Vegetativ", text: "18/6 Licht, LST ab Tag 10, EC 1.1–1.4", tone: "leaf" },
  { icon: "GitBranch", title: "Blüte", text: "12/12 umschalten, VPD 1,2–1,6 kPa, P-K-Boost", tone: "soil" },
  { icon: "Trophy", title: "Ernte", text: "Trichome milchig-bernstein, 14 Tage Slow-Cure", tone: "warning" },
];

export default function Simulation() {
  const toast = useToast();
  const [weeks, setWeeks] = useState(12);
  const [light, setLight] = useState(480);

  const curve = useMemo(
    () => Array.from({ length: weeks + 1 }, (_, w) => {
      const peak = weeks * 0.42;
      const height = Math.round(180 / (1 + Math.exp(-0.55 * (w - peak))) + 18);
      const canopy = Math.round(100 / (1 + Math.exp(-0.7 * (w - weeks * 0.33))));
      return { height, canopy };
    }),
    [weeks]
  );
  const labels = curve.map((_, i) => `KW${i}`);
  const estYield = Math.round(320 * (light / 480));

  return (
    <div className="space-y-6">
      <PageHeader title="Grow-Simulation & Planer" subtitle="Prognostiziere Wachstum, Ertrag und Phasen – KI-gestützt." icon="Activity"
        actions={<Button variant="secondary" onClick={() => toast.push({ title: "Simulation gestartet", tone: "leaf", icon: "Activity" })}><Icon name="Activity" size={16} /> Simulieren</Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="TrendingUp" size={16} /> Wachstumskurve</h2>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--accent)]" /> Höhe (cm)</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--info)]" /> Kronendach (%)</span>
              </div>
            </div>
            <SeriesChart height={240} labels={labels} series={[
              { name: "Höhe", color: "var(--accent)", data: curve.map((c) => c.height) },
              { name: "Kronendach", color: "var(--info)", data: curve.map((c) => c.canopy) },
            ]} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1.5 flex justify-between text-sm"><span className="text-fg-muted">Dauer</span><span className="font-semibold tnum">{weeks} Wo.</span></div>
                <Slider value={weeks} min={8} max={20} step={1} onChange={(e) => setWeeks(Number(e.target.value))} />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-sm"><span className="text-fg-muted">LED</span><span className="font-semibold tnum">{light} W</span></div>
                <Slider value={light} min={150} max={1000} step={10} onChange={(e) => setLight(Number(e.target.value))} />
              </div>
              <div className="rounded-xl bg-leaf-500/10 p-3 text-center">
                <div className="text-xl font-bold tnum text-leaf-600 dark:text-leaf-400">~{estYield} g</div>
                <div className="text-[10px] text-fg-subtle">progn. Ertrag</div>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.05}>
          <Card className="h-full p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="BrainCircuit" size={16} /> KI-Wachstumsplan</h2>
            <div className="space-y-1">
              {plan.map((p, i) => (
                <div key={p.title} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("grid size-8 place-items-center rounded-full", p.tone === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : p.tone === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : p.tone === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : "bg-warning-500/12 text-warning-500 dark:text-warning-400")}><Icon name={p.icon} size={15} /></span>
                    {i < plan.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-3"><div className="text-sm font-medium">{p.title}</div><div className="text-xs text-fg-muted">{p.text}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal>
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="CalendarDays" size={16} /> Phasen-Prognose</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {forecastPhases.map((p) => (
              <div key={p.key} className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className={cn("size-3 rounded-full", p.color === "leaf" ? "bg-leaf-500" : p.color === "soil" ? "bg-soil-500" : p.color === "info" ? "bg-info-500" : "bg-warning-500")} />
                  <Badge tone={p.color as never}>{p.days}</Badge>
                </div>
                <div className="mt-2 font-semibold">{p.label}</div>
                <div className="text-xs text-fg-muted">{p.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
