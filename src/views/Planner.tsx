import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, DataTable, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useStrains } from "@/data/hooks";
import { useCompare } from "@/data/compare";
import { useNav } from "@/lib/nav";
import type { Strain } from "@/types";
import { eur } from "@/lib/format";
import { useToast } from "@/components/Toast";

const mediums = [
  { name: "Living Soil", icon: "Leaf", pros: ["Wiederverwendbar", "Geringe Düngerkosten", "Komplexe Terpene"], cons: ["Lange Reifezeit", "Hoher Initialaufwand"], tone: "leaf" as const, score: 9 },
  { name: "Kokos / Perlit", icon: "Layers", pros: ["Schnelles Wachstum", "Volle Kontrolle", "Hohe Erträge"], cons: ["Dünger nötig", "Häufig gießen"], tone: "info" as const, score: 8 },
  { name: "Erde (Bio)", icon: "Sprout", pros: ["Anfängerfreundlich", "Verzeihend", "Günstig"], cons: ["Geringere Kontrolle", "Schwerer"], tone: "soil" as const, score: 7 },
];

export default function Planner() {
  const toast = useToast();
  const { strains, loading, error } = useStrains();
  const { navigate } = useNav();
  // Gemeinsame Auswahl mit der Sorten-Seite (src/data/compare.ts, max. 3, persistiert).
  const compare = useCompare();
  const selected = compare.selected;
  const [selMedium, setSelMedium] = useState<string | null>("Living Soil");

  if (loading) return <div className="space-y-4"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Planung nicht geladen" desc={error} />;

  const picked: Strain[] = selected.map((id) => strains.find((s) => s.id === id)).filter((s): s is Strain => !!s);

  const toggle = (id: string) => {
    if (!compare.toggle(id)) toast.push({ title: "Vergleich ist voll", desc: `Maximal ${compare.max} Sorten.`, tone: "warning", icon: "Scale" });
  };

  type Row = { label: string; get: (s: Strain) => string; num?: (s: Strain) => number; better?: "high" | "low" };
  const rows: Row[] = [
    { label: "Typ", get: (s) => s.type },
    { label: "THC", get: (s) => `${s.thc} %`, num: (s) => s.thc, better: "high" },
    { label: "CBD", get: (s) => `${s.cbd} %`, num: (s) => s.cbd, better: "high" },
    { label: "Blütezeit", get: (s) => `${s.flowering} Wo.`, num: (s) => s.flowering, better: "low" },
    { label: "Ertrag", get: (s) => s.yield },
    { label: "Schwierigkeit", get: (s) => ["Einfach", "Mittel", "Anspruchsvoll"][s.difficulty - 1], num: (s) => s.difficulty, better: "low" },
    { label: "Rating", get: (s) => (s.reviews ? `${s.rating} ★` : "—"), num: (s) => s.rating, better: "high" },
    { label: "Preis", get: (s) => eur(s.price), num: (s) => s.price, better: "low" },
  ];
  /** Bester Wert je Zeile (nur ab 2 Sorten und wenn nicht alle gleich). */
  const bestOf = (row: Row): number | null => {
    if (!row.num || picked.length < 2) return null;
    const values = picked.map(row.num);
    const best = row.better === "low" ? Math.min(...values) : Math.max(...values);
    return values.every((v) => v === best) ? null : best;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Grow-Planung & Vergleich" subtitle="Vergleiche Sorten, Substrate und Dünger Side-by-Side." icon="Scale" />

      {/* Strain picker */}
      <Reveal>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg-muted">Sorten zum Vergleichen ({selected.length}/{compare.max})</h2>
            <div className="flex gap-1">
              {selected.length > 0 && <Button size="sm" variant="ghost" onClick={compare.clear}>Leeren</Button>}
              <Button size="sm" variant="ghost" onClick={() => navigate("strains")}>Zu den Sorten</Button>
            </div>
          </div>
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
      {picked.length === 0 ? (
        <EmptyState icon="Scale" title="Noch keine Sorten im Vergleich" desc="Wähle oben bis zu 3 Sorten – oder markiere sie auf der Sorten-Seite mit „Vergleichen“." action={<Button onClick={() => navigate("strains")}>Sorten ansehen</Button>} />
      ) : (
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
              if (!s) return null;
              const best = bestOf(row);
              const isBest = best !== null && row.num?.(s) === best;
              return (
                <span className={cn("inline-flex items-center gap-1 font-medium tnum", isBest && "rounded-md bg-accent/15 px-1.5 py-0.5 text-accent")}>
                  {row.get(s)} {isBest && <Check className="size-3.5" aria-label="bester Wert" />}
                </span>
              );
            }}
          />
          {picked.length >= 2 && <p className="border-t border-border px-4 py-2.5 text-xs text-fg-subtle"><Check className="mr-1 inline size-3.5 text-accent" />markiert den besten Wert je Zeile (höher bzw. niedriger ist besser).</p>}
        </Card>
      </Reveal>
      )}

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
