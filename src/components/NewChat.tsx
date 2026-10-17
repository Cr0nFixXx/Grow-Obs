import { useEffect, useState } from "react";
import { Avatar, Modal } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import type { ChatPerson } from "@/services/interfaces";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** „Neue Nachricht“ (B-59): Person suchen und eine Direktnachricht öffnen. */
export function NewChatModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (person: ChatPerson) => Promise<void> }) {
  const svc = useServices();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (!open) { setQuery(""); setResults([]); setError(null); setBusy(null); } }, [open]);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < MIN_QUERY) { setResults([]); setSearching(false); return; }
    let current = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      svc.chat.searchPeople(q)
        .then((rows) => { if (current) { setResults(rows); setError(null); } })
        .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Suche fehlgeschlagen"); })
        .finally(() => { if (current) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, query, svc]);

  const pick = async (person: ChatPerson) => {
    setBusy(person.id);
    try { await onPick(person); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Chat konnte nicht gestartet werden"); }
    finally { setBusy(null); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Neue Nachricht" size="sm">
      <div className="space-y-3" data-testid="new-chat">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name oder @Handle suchen…"
          aria-label="Person suchen"
          className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent"
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Suchergebnisse">
          {results.map((p) => (
            <li key={p.id}>
              <button disabled={busy !== null} onClick={() => void pick(p)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-surface-2 disabled:opacity-60">
                <Avatar src={p.avatar} name={p.name} size={36} />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-fg-muted">@{p.handle}</span></span>
              </button>
            </li>
          ))}
        </ul>
        {!searching && query.trim().length >= MIN_QUERY && results.length === 0 && !error && <p className="text-sm text-fg-muted">Niemand gefunden.</p>}
        {query.trim().length < MIN_QUERY && <p className="text-xs text-fg-subtle">Mindestens {MIN_QUERY} Zeichen eingeben.</p>}
      </div>
    </Modal>
  );
}
