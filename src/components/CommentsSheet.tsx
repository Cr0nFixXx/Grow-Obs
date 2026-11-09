import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ReportSheet } from "@/components/community/ReportSheet";
import { BottomSheet, Avatar, Button, Spinner, Textarea } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import { moderationFor } from "@/lib/moderation-scope";
import type { CommentKind, ItemComment } from "@/services/interfaces";

/**
 * Kommentare zu einem Social-Post oder Hall-of-Fame-Eintrag. Lädt beim Öffnen, schreibt über den
 * Service-Layer (API: /social/posts/:id/comments bzw. /hall/:id/comments) und meldet die neue Anzahl.
 */
export function CommentsSheet({ kind, itemId, title, onClose, onCountChange, community }: {
  kind: CommentKind;
  itemId: string | null;
  title?: string;
  onClose: () => void;
  onCountChange?: (itemId: string, count: number) => void;
  /**
   * Moderation der Kommentare (B-61, B-89): Melden für alle, Aus-/Einblenden für die Moderation. `id` = Community; `null` =
   * globaler Feed (Plattform-Moderation).
   */
  community?: { id: string | null; canModerate: boolean };
}) {
  const svc = useServices();
  const toast = useToast();
  const [items, setItems] = useState<ItemComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<{ kind: "comment"; id: string } | null>(null);

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

  const toggleHidden = async (comment: ItemComment) => {
    if (!community) return;
    try {
      await moderationFor(svc, community.id).setHidden("comment", comment.id, !comment.hidden);
      const next = items.map((c) => (c.id === comment.id ? { ...c, hidden: comment.hidden ? undefined : true } : c));
      setItems(next);
      if (itemId) onCountChange?.(itemId, next.filter((c) => !c.hidden).length);
    } catch (e) {
      toast.push({ title: "Aktion fehlgeschlagen", desc: e instanceof Error ? e.message : "", tone: "danger", icon: "AlertTriangle" });
    }
  };

  const send = async () => {
    if (!itemId || !text.trim() || sending) return;
    setSending(true);
    try {
      const created = await svc.comments.add(kind, itemId, text.trim());
      const next = [...items, created];
      setItems(next);
      setText("");
      onCountChange?.(itemId, next.filter((c) => !c.hidden).length);
    } catch (e) {
      toast.push({ title: "Kommentar nicht gespeichert", desc: e instanceof Error ? e.message : "Bitte anmelden", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
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
                <Avatar src={c.avatar} name={c.author} size={30} />
                <div className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${c.hidden ? "border border-warning/40 bg-warning/5" : "bg-surface-2"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">{c.author}</span><span className="text-fg-subtle">{c.ago}</span>
                    {c.hidden && <Badge tone="warning">Ausgeblendet</Badge>}
                    {community && (
                      <span className="ml-auto flex gap-1">
                        {!c.mine && !c.hidden && <button type="button" onClick={() => setReporting({ kind: "comment", id: c.id })} aria-label="Kommentar melden" className="grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface"><Icon name="Flag" size={14} /></button>}
                        {community.canModerate && <button type="button" onClick={() => void toggleHidden(c)} aria-label={c.hidden ? "Kommentar wieder einblenden" : "Kommentar ausblenden"} className="grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface"><Icon name={c.hidden ? "Eye" : "EyeOff"} size={14} /></button>}
                      </span>
                    )}
                  </div>
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
    {community && <ReportSheet communityId={community.id} target={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}
