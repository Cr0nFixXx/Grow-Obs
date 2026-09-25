import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, PageHeader, Slider } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { costCalc } from "@/mocks/data";
import { eur } from "@/lib/format";

function SliderRow({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold tnum">{value}{unit}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export default function Calculator() {
  const toast = useToast();
  const [tent, setTent] = useState(costCalc.defaults.tentM2);
  const [light, setLight] = useState(costCalc.defaults.lightWatt);
  const [hours, setHours] = useState(costCalc.defaults.lightHours);
  const [weeks, setWeeks] = useState(costCalc.defaults.weeks);
  const [price, setPrice] = useState(costCalc.defaults.pricePerKwh);
  const [soil, setSoil] = useState(costCalc.defaults.soilLiters);
  const [fert, setFert] = useState(costCalc.defaults.fertCost);

  const r = useMemo(() => {
    const kwhDay = (light / 1000) * hours;
    const elecMonth = kwhDay * 30 * price;
    const elecCycle = kwhDay * 7 * weeks * price;
    const soilCost = soil * 0.34;
    const fertMonth = fert / 3;
    const totalMonth = elecMonth + soilCost / 3 + fertMonth;
    const totalCycle = elecCycle + soilCost + fert;
    const gramEst = Math.round(320 * tent);
    const perGram = totalCycle / gramEst;
    return { elecMonth, soilCost, fertMonth, totalMonth, totalCycle, gramEst, perGram };
  }, [light, hours, weeks, price, soil, fert, tent]);

  const cats = [
    { label: "Strom", value: r.elecMonth, color: "var(--accent)" },
    { label: "Substrat", value: r.soilCost / 3, color: "var(--accent-2)" },
    { label: "Dünger", value: r.fertMonth, color: "var(--info)" },
  ];
  const maxCat = Math.max(...cats.map((c) => c.value));

  return (
    <div className="space-y-6">
      <PageHeader title="Kostenrechner & Optimierer" subtitle="Plane dein Budget – live & interaktiv." icon="Euro"
        actions={<Button variant="secondary" onClick={() => toast.push({ title: "Als Vorlage gespeichert", tone: "leaf", icon: "Euro" })}>Speichern</Button>} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <Reveal className="lg:col-span-2">
          <Card className="space-y-5 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="SlidersHorizontal" size={16} /> Setup</h2>
            <SliderRow label="Zelt-Fläche" value={tent} min={0.5} max={4} step={0.1} unit=" m²" onChange={setTent} />
            <SliderRow label="LED-Leistung" value={light} min={100} max={1000} step={20} unit=" W" onChange={setLight} />
            <SliderRow label="Belichtungsdauer" value={hours} min={12} max={24} step={1} unit=" h" onChange={setHours} />
            <SliderRow label="Grow-Dauer" value={weeks} min={8} max={20} step={1} unit=" Wo." onChange={setWeeks} />
            <SliderRow label="Strompreis" value={price} min={0.2} max={0.6} step={0.01} unit=" €/kWh" onChange={setPrice} />
            <SliderRow label="Substrat" value={soil} min={20} max={300} step={10} unit=" L" onChange={setSoil} />
            <SliderRow label="Dünger-Budget" value={fert} min={20} max={200} step={5} unit=" €" onChange={setFert} />
          </Card>
        </Reveal>

        {/* Results */}
        <div className="space-y-6 lg:col-span-3">
          <Reveal>
            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                {[
                  { label: "Strom / Monat", value: eur(r.elecMonth, true), icon: "Zap", tone: "leaf" },
                  { label: "Substrat", value: eur(r.soilCost, true), icon: "Leaf", tone: "soil" },
                  { label: "Dünger / Mo.", value: eur(r.fertMonth, true), icon: "Droplets", tone: "info" },
                  { label: "Gesamt / Mo.", value: eur(r.totalMonth, true), icon: "Euro", tone: "warning" },
                ].map((s) => (
                  <div key={s.label} className="bg-surface p-4">
                    <span className={cn("grid size-8 place-items-center rounded-lg", s.tone === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : s.tone === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : s.tone === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : "bg-warning-500/12 text-warning-500 dark:text-warning-400")}>
                      <Icon name={s.icon} size={16} />
                    </span>
                    <div className="mt-2 text-lg font-bold tnum">{s.value}</div>
                    <div className="text-xs text-fg-subtle">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center justify-between gap-3 bg-accent/[0.06] p-5 sm:flex-row">
                <div>
                  <div className="text-xs text-fg-muted">Kosten pro Cycle ({weeks} Wo.)</div>
                  <div className="text-3xl font-bold tnum text-accent">{eur(r.totalCycle, true)}</div>
                </div>
                <div className="flex gap-6 text-center">
                  <div><div className="text-xl font-bold tnum">~{r.gramEst} g</div><div className="text-xs text-fg-subtle">Ertrag</div></div>
                  <div><div className="text-xl font-bold tnum">{eur(r.perGram, true)}</div><div className="text-xs text-fg-subtle">pro Gramm</div></div>
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.05}>
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">Kostenverteilung / Monat</h2>
              <div className="space-y-2.5">
                {cats.map((c) => (
                  <div key={c.label} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-fg-muted">{c.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(c.value / maxCat) * 100}%`, background: c.color }} /></div>
                    <span className="w-16 text-right font-medium tnum">{eur(c.value, true)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="TrendingDown" size={16} /> Optimierungs-Vorschläge</h2>
              <div className="space-y-2">
                {costCalc.suggestions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-leaf-500/12 text-leaf-500 dark:text-leaf-400"><Icon name={s.icon} size={17} /></span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.title}</div><div className="text-xs text-fg-subtle">{s.desc}</div></div>
                    <Badge tone="leaf">−{eur(s.save)}/Mo.</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
