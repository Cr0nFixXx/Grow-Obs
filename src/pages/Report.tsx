import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { SeriesChart } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { grows } from "@/mocks/data";

export default function Report() {
  const toast = useToast();
  const g = grows[0];
  const metrics = [
    { label: "Dauer", value: `${g.day} Tage`, icon: "CalendarDays" },
    { label: "Gesundheit Ø", value: `${g.health}%`, icon: "HeartPulse" },
    { label: "Erwartet", value: g.expectedYield, icon: "Trophy" },
    { label: "Phase", value: g.phase, icon: "GitBranch" },
  ];

  // PDF-Export via Browser-Druckdialog (offline, ohne schwere Bibliothek)
  const exportPDF = () => {
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) {
      toast.push({ title: "Pop-up blockiert", desc: "Bitte Pop-ups für den Export erlauben.", tone: "warning", icon: "AlertTriangle" });
      return;
    }
    const phases = g.phases
      .map((p) => `<li><strong>${p.label}</strong> (Tag ${p.start}–${p.end}) — ${p.done ? "abgeschlossen" : "offen"}</li>`)
      .join("");
    win.document.write(
      `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Grow-Report – ${g.name}</title><style>*{font-family:-apple-system,system-ui,'Segoe UI',sans-serif;box-sizing:border-box}body{margin:40px;color:#15241a}h1{color:#1c6930;margin:0 0 4px;font-size:28px}.sub{color:#6b7264;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{border:1px solid #e2e6db;border-radius:10px;padding:12px}.stat .l{font-size:11px;color:#8a9082;text-transform:uppercase;letter-spacing:.04em}.stat .v{font-size:18px;font-weight:700;margin-top:2px}h2{color:#1c6930;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:28px 0 8px}ul{margin:0;padding-left:18px}li{margin:4px 0}p{line-height:1.6;margin:8px 0}.foot{margin-top:40px;border-top:1px solid #e2e6db;padding-top:12px;font-size:11px;color:#8a9082}</style></head><body>` +
        `<h1>Grow-Report</h1><div class="sub">${g.name} · ${g.strain} · ${g.breeder} · ${g.medium} · Start ${new Date(g.startDate).toLocaleDateString("de-DE")}</div>` +
        `<div class="grid"><div class="stat"><div class="l">Dauer</div><div class="v">${g.day} Tage</div></div><div class="stat"><div class="l">Gesundheit</div><div class="v">${g.health}%</div></div><div class="stat"><div class="l">Erwartet</div><div class="v">${g.expectedYield}</div></div><div class="stat"><div class="l">Phase</div><div class="v">${g.phase}</div></div></div>` +
        `<h2>Phasen-Verlauf</h2><ul>${phases}</ul><h2>Fazit</h2><p>Der Grow verläuft bis Tag ${g.day} sehr stabil. Die VPD lag stets im Optimalbereich, die Pflanzen zeigen eine gleichmäßige Blütenbildung. Empfehlung: in den letzten 2 Wochen die Düngung stoppen und auf die Trichom-Reife achten.</p>` +
        `<div class="foot">Grow|Observer · generiert am ${new Date().toLocaleString("de-DE")}</div></body></html>`
    );
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 350);
    toast.push({ title: "Druckansicht geöffnet", desc: "Im Druckdialog als PDF speichern.", tone: "leaf", icon: "Download" });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Grow-Report" subtitle={`Dokumentation & Auswertung für „${g.name}“`} icon="Newspaper"
        actions={
          <>
            <Button variant="secondary" onClick={exportPDF}><Icon name="Download" size={16} /> PDF</Button>
            <Button onClick={() => toast.push({ title: "Bild exportiert", tone: "leaf", icon: "Image" })}><Icon name="Image" size={16} /> Bild</Button>
          </>
        } />

      {/* Summary */}
      <Reveal>
        <Card className="grid grid-cols-2 gap-px overflow-hidden p-0 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name={m.icon} size={13} /> {m.label}</div>
              <div className="mt-1 font-semibold tnum">{m.value}</div>
            </div>
          ))}
        </Card>
      </Reveal>

      {/* Timeline */}
      <Reveal>
        <Card className="p-5">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="GitBranch" size={16} /> Phasen-Timeline</h2>
          <div className="relative">
            <div className="absolute left-0 right-0 top-3 h-1 rounded-full bg-surface-3" />
            <div className="absolute left-0 top-3 h-1 rounded-full bg-accent" style={{ width: `${g.progress}%` }} />
            <div className="relative flex justify-between">
              {g.phases.map((p) => {
                const active = !p.done && g.phase === p.label;
                return (
                  <div key={p.key} className="flex flex-1 flex-col items-center px-1 text-center">
                    <span className={cn("grid size-7 place-items-center rounded-full border-2 border-bg text-[10px] font-bold", p.done || active ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-subtle", active && "ring-4 ring-accent/25")}>
                      {p.done ? <Icon name="CheckCircle2" size={13} /> : "•"}
                    </span>
                    <span className={cn("mt-2 text-xs font-medium", p.done || active ? "text-fg" : "text-fg-subtle")}>{p.label}</span>
                    <span className="text-[10px] text-fg-subtle">Tag {p.start}–{p.end}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Environment chart */}
      <Reveal>
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Thermometer" size={16} /> Umwelt-Auswertung</h2>
          <SeriesChart height={200} labels={g.env.map((e) => `T${e.day}`)} series={[
            { name: "Temp", color: "var(--accent)", data: g.env.map((e) => e.temp) },
            { name: "Feuchte", color: "var(--info)", data: g.env.map((e) => e.rh) },
          ]} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "VPD Ø", v: "1.21 kPa", icon: "Droplets" },
              { l: "EC Ø", v: "1.42 mS", icon: "Zap" },
              { l: "pH Ø", v: "6.3", icon: "Activity" },
              { l: "Temperatur Ø", v: "24.6 °C", icon: "Thermometer" },
            ].map((x) => (
              <div key={x.l} className="rounded-xl bg-surface-2 p-3 text-center">
                <Icon name={x.icon} size={16} className="mx-auto text-accent" />
                <div className="mt-1 text-sm font-semibold tnum">{x.v}</div>
                <div className="text-[10px] text-fg-subtle">{x.l}</div>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      {/* Conclusion */}
      <Reveal>
        <Card className="p-5">
          <div className="flex items-center gap-2"><Badge tone="leaf"><Icon name="CheckCircle2" size={12} /> Sehr guter Verlauf</Badge></div>
          <h2 className="mt-3 font-semibold">Fazit</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Der Grow verläuft bis Tag {g.day} sehr stabil. Die VPD lag stets im Optimalbereich, die Pflanzen zeigen eine gleichmäßige Blütenbildung.
            Empfehlung: In den letzten 2 Wochen die Düngung stoppen und auf die Trichom-Reife achten.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => toast.push({ title: "Geteilt", desc: "Link in Zwischenablage.", tone: "leaf", icon: "Share2" })}><Icon name="Share2" size={16} /> Teilen</Button>
            <Button variant="ghost" onClick={() => toast.push({ title: "Als Vorlage gespeichert", tone: "info", icon: "Database" })}><Icon name="Database" size={16} /> Vorlage</Button>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
