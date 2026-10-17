import { useState } from "react";
import { Heart, MessageCircle, Send } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, Popover, PopoverItem, SkeletonCard, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { CommentsSheet } from "@/components/CommentsSheet";
import { useCommunityFeed } from "@/data/hooks";
import { cn } from "@/utils/cn";
import type { ReportKind } from "@/types";
import { ReportSheet } from "./ReportSheet";

/** Feed einer Community (B-61): nur Mitglieder; Moderation blendet Beiträge/Kommentare aus und ein, jedes Mitglied kann melden. */
export function CommunityFeed({ communityId, canModerate }: { communityId: string; canModerate: boolean }) {
  const toast = useToast();
  const { posts, loading, error, createPost, toggleLike, setHidden } = useCommunityFeed(communityId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reporting, setReporting] = useState<{ kind: ReportKind; id: string } | null>(null);

  const fail = (title: string, e: unknown) => toast.push({ title, desc: e instanceof Error ? e.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
  const publish = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await createPost(text.trim()); setText(""); }
    catch (e) { fail("Nicht veröffentlicht", e); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="community-feed">
      <Card className="space-y-3 p-4">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={10000} placeholder="Was gibt es Neues in dieser Community?" aria-label="Beitrag schreiben" />
        <div className="flex justify-end"><Button onClick={() => void publish()} loading={busy} disabled={!text.trim()}><Send className="size-4" /> Beitrag</Button></div>
      </Card>

      {loading && posts.length === 0 ? <SkeletonCard />
        : error && posts.length === 0 ? <EmptyState icon="AlertTriangle" title="Feed nicht geladen" desc={error} />
        : posts.length === 0 ? <EmptyState icon="MessageCircle" title="Noch keine Beiträge" desc="Schreib den ersten Beitrag für diese Community." />
        : posts.map((p) => (
          <Card key={p.id} className={cn("p-4", p.hidden && "border-warning/40 bg-warning/5")} data-testid="community-post">
            <div className="flex items-start gap-3">
              <Avatar src={p.avatar} name={p.author} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{p.author}</span>
                  <span className="text-xs text-fg-subtle">{p.handle} · {p.time}</span>
                  {p.hidden && <Badge tone="warning">Ausgeblendet</Badge>}
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm">{p.text}</p>
                {p.image && <img src={p.image} alt="" className="mt-3 max-h-80 rounded-xl object-cover" loading="lazy" />}
                <div className="mt-3 flex items-center gap-4 text-sm text-fg-muted">
                  <button type="button" onClick={() => void toggleLike(p.id).catch((e) => fail("Like fehlgeschlagen", e))} aria-pressed={!!p.liked} aria-label="Gefällt mir" className={cn("flex min-h-9 items-center gap-1.5", p.liked && "text-danger")}>
                    <Heart className={cn("size-4", p.liked && "fill-current")} /> {p.likes}
                  </button>
                  <button type="button" onClick={() => setCommentsFor(p.id)} aria-label="Kommentare" className="flex min-h-9 items-center gap-1.5"><MessageCircle className="size-4" /> {counts[p.id] ?? p.comments}</button>
                  {(canModerate || !p.mine) && (
                    <span className="ml-auto">
                      <Popover align="end" triggerClassName="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2" trigger={<Icon name="MoreHorizontal" size={18} />}>
                        {(close) => (<>
                          {!p.mine && !p.hidden && <PopoverItem icon="Flag" onClick={() => { close(); setReporting({ kind: "post", id: p.id }); }}>Melden</PopoverItem>}
                          {canModerate && (p.hidden
                            ? <PopoverItem icon="Eye" onClick={() => { close(); void setHidden(p.id, false).catch((e) => fail("Einblenden fehlgeschlagen", e)); }}>Wieder einblenden</PopoverItem>
                            : <PopoverItem icon="EyeOff" danger onClick={() => { close(); void setHidden(p.id, true).catch((e) => fail("Ausblenden fehlgeschlagen", e)); }}>Beitrag ausblenden</PopoverItem>)}
                        </>)}
                      </Popover>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}

      <CommentsSheet kind="post" itemId={commentsFor} title="Kommentare" onClose={() => setCommentsFor(null)}
        onCountChange={(id, n) => setCounts((c) => ({ ...c, [id]: n }))}
        community={{ id: communityId, canModerate }} />
      <ReportSheet communityId={communityId} target={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
