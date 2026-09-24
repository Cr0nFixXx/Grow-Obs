import { useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, BottomSheet, Button, Card, Modal, PageHeader, SmartImage } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useToast } from "@/components/Toast";
import { useLongPress } from "@/lib/hooks";
import { hallOfFame, type HallEntry } from "@/mocks/data";

function HofCard({
  h,
  liked,
  onToggle,
  onOpen,
  onMenu,
}: {
  h: HallEntry;
  liked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const { handlers, wasLongPress } = useLongPress(onMenu);
  return (
    <div className="card card-hover overflow-hidden break-inside-avoid">
      <button onClick={() => { if (!wasLongPress()) onOpen(); }} className="block w-full" {...handlers}>
        <SmartImage src={h.image} alt={h.title} className={cn("w-full", h.aspect)} />
      </button>
      <div className="p-3">
        <Badge tone="warning" className="mb-2"><Icon name="Trophy" size={11} /> {h.award}</Badge>
        <div className="font-semibold">{h.title}</div>
        <div className="text-xs text-fg-subtle">{h.strain}</div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <Avatar src={h.avatar} size={22} />
            <span className="text-xs text-fg-muted">{h.grower}</span>
          </div>
          <button onClick={onToggle} className={cn("flex items-center gap-1 text-sm transition", liked ? "text-danger" : "text-fg-subtle hover:text-danger")}>
            <Heart className={cn("size-4", liked && "fill-current")} /> {h.likes + (liked ? 1 : 0)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HallOfFame() {
  const toast = useToast();
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<HallEntry | null>(null);
  const [menuFor, setMenuFor] = useState<HallEntry | null>(null);
  const featured = hallOfFame[2];
  const toggle = (id: string) => setLiked((l) => ({ ...l, [id]: !l[id] }));

  const menuActions = [
    { icon: "Share2", label: "Link kopieren", action: () => toast.push({ title: "Link kopiert", desc: featured && menuFor ? menuFor.title : "", tone: "leaf", icon: "Share2" }) },
    { icon: "Bookmark", label: "Merken", action: () => toast.push({ title: "Showcase gemerkt", tone: "info", icon: "Bookmark" }) },
    { icon: "Flag", label: "Melden", action: () => toast.push({ title: "Gemeldet", desc: "Danke, wir prüfen es.", tone: "warning", icon: "Flag" }) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Hall of Fame" subtitle="Die besten Grows der Community – kuratiert und prämiert." icon="Trophy"
        actions={<Badge tone="warning"><Icon name="Trophy" size={13} /> Grow der Woche</Badge>} />

      {/* Featured */}
      <Reveal>
        <Card className="relative overflow-hidden p-0">
          <button onClick={() => setLightbox(featured)} className="block w-full text-left">
            <div className="relative h-56 sm:h-72">
              <SmartImage src={featured.image} alt={featured.title} className="size-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute left-4 top-4"><Badge tone="warning" className="text-sm"><Icon name="Trophy" size={14} /> {featured.award}</Badge></div>
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between text-white">
                <div>
                  <div className="text-xl font-bold sm:text-2xl">{featured.title}</div>
                  <div className="text-sm text-white/80">{featured.strain}</div>
                  <div className="mt-2 flex items-center gap-2 text-sm"><Avatar src={featured.avatar} size={24} /> {featured.grower}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1"><Heart className="size-4 fill-current" /> {featured.likes}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="size-4" /> {featured.comments}</span>
                </div>
              </div>
            </div>
          </button>
        </Card>
      </Reveal>

      {/* Masonry — Lang-Druck öffnet Kontextmenü */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
        {hallOfFame.map((h, i) => (
          <Reveal key={h.id} delay={(i % 3) * 0.05}>
            <HofCard h={h} liked={!!liked[h.id]} onToggle={() => toggle(h.id)} onOpen={() => setLightbox(h)} onMenu={() => setMenuFor(h)} />
          </Reveal>
        ))}
      </div>

      <div className="flex justify-center">
        <Button variant="secondary" onClick={() => toast.push({ title: "Weitere Showcases", desc: "Neue Top-Grows werden regelmäßig kuratiert.", tone: "leaf", icon: "Trophy" })}>Mehr anzeigen</Button>
      </div>

      <Modal open={!!lightbox} onClose={() => setLightbox(null)} size="xl" title={lightbox?.title}>
        {lightbox && (
          <div>
            <SmartImage src={lightbox.image} alt={lightbox.title} className="max-h-[70vh] w-full rounded-xl object-contain bg-black/5" />
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><Avatar src={lightbox.avatar} size={32} /><div><div className="text-sm font-medium">{lightbox.grower}</div><div className="text-xs text-fg-subtle">{lightbox.strain}</div></div></div>
              <Badge tone="warning"><Icon name="Trophy" size={12} /> {lightbox.award}</Badge>
            </div>
          </div>
        )}
      </Modal>

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
