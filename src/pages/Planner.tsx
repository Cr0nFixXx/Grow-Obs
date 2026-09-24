import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, DataTable, PageHeader } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { strains, type Strain } from "@/mocks/data";
import { eur } from "@/lib/format";
import { useToast } from "@/components/Toast";

const mediums = [
  { name: "Living Soil", icon: "Leaf", pros: ["Wiederverwendbar", "Geringe Düngerkosten", "Komplexe Terpene"], cons: ["Lange Reifezeit", "Hoher Initialaufwand"], tone: "leaf" as const, score: 9 },
  { name: "Kokos / Perlit", icon: "Layers", pros: ["Schnelles Wachstum", "Volle Kontrolle", "Hohe Erträge"], cons: ["Dünger nötig", "Häufig gießen"], tone: "info" as const, score: 8 },
  { name: "Erde (Bio)", icon: "Sprout", pros: ["Anfängerfreundlich", "Verzeihend", "Günstig"], cons: ["Geringere Kontrolle", "Schwerer"], tone: "soil" as const, score: 7 },
];

export default function Planner() {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([strains[1].id, strains[2].id, strains[3].id]);
  const [selMedium, setSelMedium] = useState<string | null>("Living Soil");
  const picked: Strain[] = strains.filter((s) => selected.includes(s.id));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]));

  const rows: { label: string; get: (s: Strain) => string }[] = [
    { label: "Typ", get: (s) => s.type },
    { label: "THC", get: (s) => `${s.thc} %` },
    { label: "CBD", get: (s) => `${s.cbd} %` },
    { label: "Blütezeit", get: (s) => `${s.flowering} Wo.` },
    { label: "Ertrag", get: (s) => s.yield },
    { label: "Schwierigkeit", get: (s) => ["Einfach", "Mittel", "Anspruchsvoll"][s.difficulty - 1] },
    { label: "Rating", get: (s) => `${s.rating} ★` },
    { label: "Preis", get: (s) => eur(s.price) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Grow-Planung & Vergleich" subtitle="Vergleiche Sorten, Substrate und Dünger Side-by-Side." icon="Scale" />

      {/* Strain picker */}
      <Reveal>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-fg-muted">Sorten zum Vergleichen ({selected.length}/3)</h2></div>
          <div className="flex flex-wrap gap-2">
            {strains.map((s) => (
              <Chip key={s.id} active={selected.includes(s.id)} onClick={() => toggle(s.id)}>
                {selected.includes(s.id) && <Check className="size-3.5" />} {s.name}
              </Chip>
            ))}
          </div>
        </Card>
      </Reveal>

      {/* Comparison table */}
      <Reveal>
        <Card className="overflow-hidden p-0">
          <DataTable
            rows={rows}
            getKey={(r) => r.label}
            columns={[
              { key: "label", header: "Eigenschaft", className: "font-medium text-fg-subtle" },
              ...picked.map((s) => ({
                key: s.id,
                header: (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <button onClick={() => toggle(s.id)} className="text-fg-subtle hover:text-danger" aria-label="Entfernen"><X className="size-4" /></button>
                    </div>
                    <div className="text-xs font-normal text-fg-subtle">{s.breeder}</div>
                  </div>
                ),
              })),
              ...(selected.length < 3
                ? [{
                    key: "add",
                    header: <button onClick={() => { const n = strains.find((s) => !selected.includes(s.id)); if (n) toggle(n.id); }} className="flex items-center gap-1 text-accent"><Plus className="size-4" /> Hinzufügen</button>,
                  }]
                : []),
            ]}
            renderCell={(colKey, row) => {
              if (colKey === "label") return <span className="text-fg-muted">{row.label}</span>;
              const s = picked.find((x) => x.id === colKey);
              return s ? <span className="font-medium tnum">{row.get(s)}</span> : null;
            }}
          />
        </Card>
      </Reveal>

      {/* Medium compare */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-fg-muted">Substrat im Vergleich</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {mediums.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.05}>
              <Card className={cn("flex h-full flex-col p-5 transition-all", selMedium === m.name && "border-accent ring-2 ring-accent/25")}>
                <div className="flex items-center justify-between">
                  <span className={cn("grid size-11 place-items-center rounded-xl", m.tone === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : m.tone === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : "bg-info-500/12 text-info-500 dark:text-info-400")}><Icon name={m.icon} size={22} /></span>
                  <Badge tone={m.tone}>{m.score}/10</Badge>
                </div>
                <div className="mt-3 font-semibold">{m.name}</div>
                <ul className="mt-2 flex-1 space-y-1 text-sm">
                  {m.pros.map((p) => <li key={p} className="flex items-center gap-2 text-leaf-600 dark:text-leaf-400"><Icon name="CheckCircle2" size={14} /> {p}</li>)}
                  {m.cons.map((c) => <li key={c} className="flex items-center gap-2 text-fg-subtle"><X className="size-3.5" /> {c}</li>)}
                </ul>
                <Button
                  className="mt-4 w-full"
                  variant={selMedium === m.name ? "primary" : "secondary"}
                  onClick={() => { setSelMedium(m.name); toast.push({ title: `${m.name} ausgewählt`, desc: "Als Substrat für die Planung übernommen.", tone: m.tone, icon: m.icon }); }}
                >
                  {selMedium === m.name ? (<><Icon name="Check" size={16} /> Ausgewählt</>) : "Auswählen"}
                </Button>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
