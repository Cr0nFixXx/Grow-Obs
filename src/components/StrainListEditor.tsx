import { useId } from "react";
import { Icon } from "@/components/Icon";
import { Button, Chip, Input } from "@/components/ui";
import { useStrainCatalog } from "@/data/hooks";
import { MAX_GROW_STRAINS, emptyStrain } from "@/lib/grow-strains";
import { GENETICS, GENETICS_HINT, LIGHT_LABEL, LIGHT_TYPES, SEED_LABEL, SEED_TYPES } from "@/lib/grow-traits";
import type { GrowStrain } from "@/types";

/** Freiwillige Einzelwahl als Chips: ein zweiter Tipp auf die gewählte Chip nimmt die Angabe wieder zurück. */
function TraitChips<T extends string>({ label, testId, options, value, onChange }: { label: string; testId: string; options: { value: T; label: string; title?: string }[]; value: T | null | undefined; onChange: (next: T | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label} data-testid={testId}>
      <span className="w-14 shrink-0 text-xs text-fg-subtle">{label}</span>
      {options.map((o) => (
        <Chip key={o.value} type="button" title={o.title} active={value === o.value} aria-pressed={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)}>{o.label}</Chip>
      ))}
    </div>
  );
}

/**
 * B-100: Sortenliste eines Grows. Je Zeile Name (mit Vorschlägen aus dem Sortenkatalog, Freitext bleibt möglich),
 * Breeder und Pflanzenzahl, dazu (B-105, freiwillig) Genetik, Lichttyp und Samentyp; „+ Sorte hinzufügen“ bis 20. Wählt man eine Katalogsorte, füllt sich ein leerer Breeder.
 */
export function StrainListEditor({ value, onChange, error }: { value: GrowStrain[]; onChange: (next: GrowStrain[]) => void; error?: string }) {
  const listId = useId();
  const { strains: catalog } = useStrainCatalog();
  const names = [...new Set(catalog.map((s) => s.name))].slice(0, 400);
  const set = (index: number, patch: Partial<GrowStrain>) => onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const setName = (index: number, name: string) => {
    const match = catalog.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    set(index, { name, ...(match && !value[index].breeder.trim() ? { breeder: match.breeder } : {}) });
  };
  return (
    <div className="space-y-3" data-testid="strain-list">
      <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">Sorten</span>
        <span className="text-xs text-fg-subtle">{value.length} von {MAX_GROW_STRAINS}</span>
      </div>
      {value.map((s, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3" data-testid="strain-row">
          <div className="flex items-center gap-2">
            <Input value={s.name} onChange={(e) => setName(i, e.target.value)} list={listId} maxLength={100} placeholder={i === 0 ? "z. B. Gorilla Glue #4" : "Weitere Sorte"} aria-label={`Sorte ${i + 1}`} data-testid="strain-name" autoComplete="off" />
            {value.length > 1 && (
              <Button type="button" size="sm" variant="ghost" className="shrink-0 text-danger hover:bg-danger/10" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Sorte ${i + 1} entfernen`} data-testid="strain-remove">
                <Icon name="Trash2" size={16} />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2">
            <Input value={s.breeder} onChange={(e) => set(i, { breeder: e.target.value })} maxLength={100} placeholder="Breeder (optional)" aria-label={`Breeder zu Sorte ${i + 1}`} data-testid="strain-breeder" />
            <Input type="number" inputMode="numeric" min={1} max={999} step={1} value={s.plants ?? ""} onChange={(e) => set(i, { plants: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Pflanzen" aria-label={`Pflanzen von Sorte ${i + 1}`} data-testid="strain-plants" />
          </div>
          <div className="space-y-1.5 pt-0.5" data-testid="strain-traits">
            <TraitChips label="Genetik" testId="strain-genetics" options={GENETICS.map((g) => ({ value: g, label: g, title: GENETICS_HINT[g] }))} value={s.genetics} onChange={(v) => set(i, { genetics: v })} />
            <TraitChips label="Licht" testId="strain-light" options={LIGHT_TYPES.map((l) => ({ value: l, label: LIGHT_LABEL[l] }))} value={s.light} onChange={(v) => set(i, { light: v })} />
            <TraitChips label="Samen" testId="strain-seed" options={SEED_TYPES.map((x) => ({ value: x, label: SEED_LABEL[x] }))} value={s.seed} onChange={(v) => set(i, { seed: v })} />
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      <Button type="button" size="sm" variant="secondary" disabled={value.length >= MAX_GROW_STRAINS} onClick={() => onChange([...value, emptyStrain()])} data-testid="strain-add">
        <Icon name="Plus" size={14} /> Sorte hinzufügen
      </Button>
    </div>
  );
}
