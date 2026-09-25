import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { BottomSheet, Avatar, Button, Spinner, Textarea } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import type { CommentKind, ItemComment } from "@/services/interfaces";

/**
 * Kommentare zu einem Social-Post oder Hall-of-Fame-Eintrag. Lädt beim Öffnen, schreibt über den
 * Service-Layer (API: /social/posts/:id/comments bzw. /hall/:id/comments) und meldet die neue Anzahl.
 */
export function CommentsSheet({ kind, itemId, title, onClose, onCountChange }: {
  kind: CommentKind;
  itemId: string | null;
  title?: string;
  onClose: () => void;
  onCountChange?: (itemId: string, count: number) => void;
}) {
  const svc = useServices();
  const toast = useToast();
  const [items, setItems] = useState<ItemComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    setLoading(true);
    setItems([]);
    svc.comments.list(kind, itemId)
      .then((list) => { if (alive) setItems(list); })
      .catch((e: unknown) => toast.push({ title: "Kommentare nicht geladen", desc: e instanceof Error ? e.message : "", tone: "danger", icon: "AlertTriangle" }))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [svc, kind, itemId, toast]);

  const send = async () => {
    if (!itemId || !text.trim() || sending) return;
    setSending(true);
    try {
      const created = await svc.comments.add(kind, itemId, text.trim());
      const next = [...items, created];
      setItems(next);
      setText("");
      onCountChange?.(itemId, next.length);
    } catch (e) {
      toast.push({ title: "Kommentar nicht gespeichert", desc: e instanceof Error ? e.message : "Bitte anmelden", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={!!itemId} onClose={onClose} title={title ?? "Kommentare"}>
      <div className="space-y-4">
        {loading ? (
          <div className="grid place-items-center py-8 text-accent"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">Noch keine Kommentare – schreib den ersten.</p>
        ) : (
          <ul className="space-y-3" aria-label="Kommentare">
            {items.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar src={c.avatar} size={30} />
                <div className="min-w-0 flex-1 rounded-2xl bg-surface-2 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs"><span className="font-medium">{c.author}</span><span className="text-fg-subtle">{c.ago}</span></div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex items-end gap-2 border-t border-border bg-surface px-5 py-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Kommentar schreiben…" rows={1} maxLength={2000} className="min-h-11 resize-none" />
          <Button onClick={() => void send()} loading={sending} disabled={!text.trim()} aria-label="Kommentar senden"><Send className="size-4" /></Button>
        </div>
      </div>
    </BottomSheet>
  );
}
