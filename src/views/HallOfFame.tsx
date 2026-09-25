import { useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, BottomSheet, Button, EmptyState, PageHeader, SkeletonCard, SmartImage, SwipeLightbox } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useToast } from "@/components/Toast";
import { useLongPress } from "@/lib/hooks";
import { useHall } from "@/data/hooks";
import { copyText } from "@/lib/share";
import { CommentsSheet } from "@/components/CommentsSheet";
import type { HallEntry } from "@/types";

function HofCard({
  h,
  liked,
  onToggle,
  onOpen,
  onMenu,
  onComments,
  featured = false,
}: {
  h: HallEntry;
  onComments: () => void;
  featured?: boolean;
  liked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const { handlers, wasLongPress } = useLongPress(onMenu);
  return (
    <div className={cn("card card-hover overflow-hidden", featured && "sm:grid sm:grid-cols-[1.4fr_1fr]")}>
      <button onClick={() => { if (!wasLongPress()) onOpen(); }} className="relative block w-full" aria-label={`${h.title} vergrößern`} {...handlers}>
        <SmartImage src={h.image} alt={h.title} className={cn("w-full", featured ? "aspect-[16/10] sm:aspect-auto sm:h-full sm:min-h-72" : h.aspect)} />
        {featured && <span className="absolute left-3 top-3"><Badge tone="warning"><Icon name="Trophy" size={11} /> Grow der Woche</Badge></span>}
      </button>
      <div className={cn("p-3", featured && "flex flex-col justify-center sm:p-6")}>
        <Badge tone="warning" className="mb-2 self-start"><Icon name="Trophy" size={11} /> {h.award}</Badge>
        <div className={cn("font-semibold", featured && "text-xl sm:text-2xl")}>{h.title}</div>
        <div className="text-xs text-fg-subtle">{h.strain}</div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <Avatar src={h.avatar} size={22} />
            <span className="text-xs text-fg-muted">{h.grower}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onComments} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-fg-subtle transition hover:bg-surface-2 hover:text-fg" aria-label={`${h.comments} Kommentare anzeigen`}>
              <MessageCircle className="size-4" /> {h.comments}
            </button>
            <button onClick={onToggle} className={cn("flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm transition", liked ? "text-danger" : "text-fg-subtle hover:text-danger")} aria-pressed={liked}>
              <Heart className={cn("size-4", liked && "fill-current")} /> {h.likes + (liked ? 1 : 0)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HallOfFame() {
  const toast = useToast();
  const { entries: loaded, loading, error } = useHall();
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentsFor, setCommentsFor] = useState<HallEntry | null>(null);
  const entries = loaded.map((e) => (e.id in commentCounts ? { ...e, comments: commentCounts[e.id] } : e));
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<HallEntry | null>(null);
  const [menuFor, setMenuFor] = useState<HallEntry | null>(null);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Hall of Fame nicht geladen" desc={error} />;

  const featured = entries[2] ?? entries[0];
  const rest = entries.filter((e) => e.id !== featured?.id);
  const toggle = (id: string) => setLiked((l) => ({ ...l, [id]: !l[id] }));

  const menuActions = [
    { icon: "Share2", label: "Link kopieren", action: () => void copyText(`${window.location.origin}/?view=hallOfFame`).then((ok) => toast.push(ok ? { title: "Link kopiert", desc: menuFor?.title ?? "", tone: "leaf", icon: "Share2" } : { title: "Kopieren nicht möglich", tone: "warning", icon: "AlertTriangle" })) },
    { icon: "Bookmark", label: "Merken", action: () => toast.push({ title: "Showcase gemerkt", tone: "info", icon: "Bookmark" }) },
    { icon: "Flag", label: "Melden", action: () => toast.push({ title: "Gemeldet", desc: "Danke, wir prüfen es.", tone: "warning", icon: "Flag" }) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Hall of Fame" subtitle="Die besten Grows der Community – kuratiert und prämiert." icon="Trophy"
        actions={<Badge tone="warning"><Icon name="Trophy" size={13} /> Grow der Woche</Badge>} />

      {/* Featured – gleiche Kartensprache wie das Raster (Bild + Info-Leiste), nur breiter */}
      {featured && (
        <Reveal>
          <HofCard h={featured} featured onComments={() => setCommentsFor(featured)} liked={!!liked[featured.id]} onToggle={() => toggle(featured.id)} onOpen={() => setLightbox(featured)} onMenu={() => setMenuFor(featured)} />
        </Reveal>
      )}

      {/* Masonry — Lang-Druck öffnet Kontextmenü. Featured wird hier nicht doppelt gezeigt. */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {rest.map((h, i) => (
          <Reveal key={h.id} delay={(i % 3) * 0.05} className="mb-4 break-inside-avoid">
            <HofCard h={h} onComments={() => setCommentsFor(h)} liked={!!liked[h.id]} onToggle={() => toggle(h.id)} onOpen={() => setLightbox(h)} onMenu={() => setMenuFor(h)} />
          </Reveal>
        ))}
      </div>

      <div className="flex justify-center">
        <Button variant="secondary" onClick={() => toast.push({ title: "Weitere Showcases", desc: "Neue Top-Grows werden regelmäßig kuratiert.", tone: "leaf", icon: "Trophy" })}>Mehr anzeigen</Button>
      </div>

      <SwipeLightbox
        open={!!lightbox}
        images={entries.map((entry) => ({
          src: entry.image,
          alt: entry.title,
          caption: <span>{entry.grower} · {entry.strain} · {entry.award}</span>,
        }))}
        index={Math.max(0, entries.findIndex((entry) => entry.id === lightbox?.id))}
        onIndexChange={(itemIndex) => setLightbox(entries[itemIndex] ?? null)}
        onClose={() => setLightbox(null)}
      />

      <CommentsSheet kind="hall" itemId={commentsFor?.id ?? null} title={commentsFor ? `Kommentare · ${commentsFor.title}` : undefined}
        onClose={() => setCommentsFor(null)} onCountChange={(id, n) => setCommentCounts((c) => ({ ...c, [id]: n }))} />

      {/* Long-press context menu */}
      <BottomSheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title}>
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {menuActions.map((a) => (
            <button key={a.label} onClick={() => { a.action(); setMenuFor(null); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2">
              <span className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent"><Icon name={a.icon} size={17} /></span>
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
