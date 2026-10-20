import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import type { ChatPerson } from "@/services/interfaces";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/**
 * Personen suchen und mehrere auswählen (Gruppe anlegen, Mitglieder einladen). Gewählte erscheinen als Chips;
 * `exclude` blendet schon vorhandene Personen aus, `max` begrenzt die Auswahl.
 */
export function PeoplePicker({ selected, onChange, exclude = [], max, label = "Person suchen" }: {
  selected: ChatPerson[];
  onChange: (next: ChatPerson[]) => void;
  exclude?: string[];
  max?: number;
  label?: string;
}) {
  const svc = useServices();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = max !== undefined && selected.length >= max;

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) { setResults([]); setSearching(false); return; }
    let current = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      svc.chat.searchPeople(q)
        .then((rows) => { if (current) { setResults(rows); setError(null); } })
        .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Suche fehlgeschlagen"); })
        .finally(() => { if (current) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, svc]);

  const taken = new Set([...exclude, ...selected.map((p) => p.id)]);
  const visible = results.filter((p) => !taken.has(p.id));
  const add = (p: ChatPerson) => { if (full) return; onChange([...selected, p]); setQuery(""); setResults([]); };

  return (
    <div className="space-y-2" data-testid="people-picker">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Ausgewählte Personen">
          {selected.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2 text-xs">
              <Avatar src={p.avatar} name={p.name} size={20} />
              <span className="max-w-[10rem] truncate font-medium">{p.name}</span>
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== p.id))} aria-label={`${p.name} entfernen`} className="grid size-4 place-items-center rounded-full text-fg-muted hover:bg-surface-3"><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={full}
        placeholder={full ? "Höchstzahl erreicht" : "Name oder @Handle suchen…"}
        aria-label={label}
        className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent disabled:opacity-60"
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Suchergebnisse">
        {visible.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => add(p)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2">
              <Avatar src={p.avatar} name={p.name} size={32} />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-fg-muted">@{p.handle}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {!searching && !full && query.trim().length >= MIN_QUERY && visible.length === 0 && !error && <p className="text-sm text-fg-muted">Niemand gefunden.</p>}
      {query.trim().length < MIN_QUERY && !full && <p className="text-xs text-fg-subtle">Mindestens {MIN_QUERY} Zeichen eingeben.</p>}
    </div>
  );
}
