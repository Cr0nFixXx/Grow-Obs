import { Chip } from "@/components/ui";
import type { Grow } from "@/types";
import { strainsWithId } from "@/lib/strain-diary";

/**
 * B-101: Sortenwahl für Tagebuch-Einträge und Fotos. Keine Auswahl = „Ganzer Grow“; mehrere Sorten sind möglich.
 * Bei Grows mit nur einer Sorte wird nichts angezeigt (die Zuordnung wäre immer dieselbe).
 */
export function StrainPicker({ grow, value, onChange, label = "Betrifft", hint }: { grow: Grow; value: string[]; onChange: (next: string[]) => void; label?: string; hint?: string }) {
  const list = strainsWithId(grow);
  if (list.length < 2) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="space-y-1.5" data-testid="strain-picker">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        <Chip type="button" active={value.length === 0} aria-pressed={value.length === 0} onClick={() => onChange([])} data-testid="strain-pick-all">Ganzer Grow</Chip>
        {list.map((s) => (
          <Chip key={s.id} type="button" active={value.includes(s.id)} aria-pressed={value.includes(s.id)} onClick={() => toggle(s.id)} data-testid="strain-pick">{s.name}</Chip>
        ))}
      </div>
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/** Kleine Sorten-Etiketten unter einem Eintrag oder Foto; ohne Zuordnung nichts (gilt für den ganzen Grow). */
export function StrainTags({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null;
  return (
    <span className={className ?? "flex flex-wrap gap-1"} data-testid="strain-tags">
      {names.map((n) => <span key={n} className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted" title={n}>{n}</span>)}
    </span>
  );
}
