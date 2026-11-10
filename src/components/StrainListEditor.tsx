import { useId } from "react";
import { Icon } from "@/components/Icon";
import { Button, Input } from "@/components/ui";
import { useStrainCatalog } from "@/data/hooks";
import { MAX_GROW_STRAINS, emptyStrain } from "@/lib/grow-strains";
import type { GrowStrain } from "@/types";

/**
 * B-100: Sortenliste eines Grows. Je Zeile Name (mit Vorschlägen aus dem Sortenkatalog, Freitext bleibt möglich),
 * Breeder und Pflanzenzahl; „+ Sorte hinzufügen“ bis 20. Wählt man eine Katalogsorte, füllt sich ein leerer Breeder.
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
        </div>
      ))}
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      <Button type="button" size="sm" variant="secondary" disabled={value.length >= MAX_GROW_STRAINS} onClick={() => onChange([...value, emptyStrain()])} data-testid="strain-add">
        <Icon name="Plus" size={14} /> Sorte hinzufügen
      </Button>
    </div>
  );
}
