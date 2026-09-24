import { useEffect, useRef, useState } from "react";
import { Bookmark, Heart, Image as ImageIcon, MessageCircle, Plus, Send, Share2, Smile } from "lucide-react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, PageHeader, Popover, PopoverItem, SmartImage, Textarea } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { currentUser, socialPosts, stories, suggestedGrowers, trendingTags, type SocialPost } from "@/mocks/data";
import { vibrate } from "@/lib/format";
import { dbGet, dbSet } from "@/lib/db";

export default function Social() {
  const toast = useToast();
  const [posts, setPosts] = useState<SocialPost[]>(socialPosts);
  const [compose, setCompose] = useState("");
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({});
  const hydrated = useRef(false);

  // Offline-First: Posts (inkl. eigener) via IndexedDB persistieren
  useEffect(() => {
    dbGet<SocialPost[]>("social-posts")
      .then((saved) => { if (saved && saved.length) setPosts(saved); })
      .catch(() => {})
      .finally(() => { hydrated.current = true; });
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    dbSet("social-posts", posts).catch(() => {});
  }, [posts]);

  const toggleLike = (id: string) => {
    vibrate();
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)));
  };
  const publish = () => {
    if (!compose.trim()) return;
    setPosts((ps) => [
      { id: `sp-${Date.now()}`, author: currentUser.name, handle: currentUser.handle, avatar: currentUser.avatar, time: "gerade eben", text: compose.trim(), likes: 0, comments: 0, shares: 0, tags: [], liked: false },
      ...ps,
    ]);
    setCompose("");
    toast.push({ title: "Veröffentlicht", desc: "Dein Post ist im Feed.", tone: "leaf", icon: "Rocket" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community-Feed"
        subtitle="Teile Updates, lerne von anderen Growern und vernetze dich."
        icon="Users"
        actions={<Button onClick={() => document.getElementById("compose-input")?.focus()}><Plus className="size-4" /> Posten</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main feed */}
        <div className="space-y-5">
          {/* Stories */}
          <Reveal>
            <Card className="p-3 sm:p-4">
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 no-scrollbar">
                {stories.map((s) => (
                  <button key={s.id} onClick={() => { vibrate(8); toast.push({ title: s.isYou ? "Story aufnehmen" : `${s.name}s Story`, tone: "info", icon: "Camera" }); }} className="relative flex shrink-0 flex-col items-center gap-1.5">
                    <span className={cn("relative rounded-full p-[3px]", s.isYou ? "ring-1 ring-dashed ring-fg-subtle" : "bg-gradient-to-br from-leaf-400 to-soil-600")}>
                      <Avatar src={s.avatar} size={56} className="ring-2 ring-surface" />
                      {s.isYou && <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg ring-2 ring-surface">+</span>}
                    </span>
                    <span className="max-w-[60px] truncate text-[11px] text-fg-muted">{s.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>

          {/* Compose */}
          <Reveal>
            <Card className="p-4">
              <div className="flex gap-3">
                <Avatar src={currentUser.avatar} size={40} />
                <div className="flex-1">
                  <Textarea id="compose-input" value={compose} onChange={(e) => setCompose(e.target.value)} placeholder="Was gibt's Neues aus deinem Grow-Raum?" rows={2} className="resize-none" />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex gap-1">
                      <button onClick={() => toast.push({ title: "Foto anhängen", desc: "Demo.", tone: "info", icon: "Image" })} className="grid size-9 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-2" aria-label="Foto"><ImageIcon size={18} /></button>
                      <button onClick={() => toast.push({ title: "Emoji", desc: "Demo.", tone: "warning", icon: "Smile" })} className="grid size-9 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-2" aria-label="Emoji"><Smile size={18} /></button>
                    </div>
                    <Button size="sm" onClick={publish} disabled={!compose.trim()}>Teilen <Send size={14} /></Button>
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* Posts */}
          {posts.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 4) * 0.04}>
              <PostCard
                p={p}
                liked={!!p.liked}
                bookmarked={!!bookmarked[p.id]}
                onLike={() => toggleLike(p.id)}
                onBookmark={() => {
                  setBookmarked((b) => ({ ...b, [p.id]: !b[p.id] }));
                  toast.push({ title: bookmarked[p.id] ? "Aus Merkliste entfernt" : "Beitrag gemerkt", tone: "info", icon: "Bookmark" });
                }}
              />
            </Reveal>
          ))}
        </div>

        {/* Right rail — nur Desktop (Mobile: reiner Feed) */}
        <div className="hidden space-y-4 lg:block">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-fg-muted">Grower zum Folgen</h2>
            <div className="space-y-3">
              {suggestedGrowers.map((g) => (
                <div key={g.id} className="flex items-center gap-3">
                  <Avatar src={g.avatar} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{g.name}</div>
                    <div className="truncate text-xs text-fg-subtle">{g.expertise} · {g.followers}</div>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => { vibrate(); toast.push({ title: `${g.name} gefolgt`, tone: "leaf", icon: "Users" }); }}>Folgen</Button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-fg-muted">Trending Tags</h2>
            <div className="flex flex-wrap gap-2">
              {trendingTags.map((t) => (
                <button key={t.tag} onClick={() => toast.push({ title: `#${t.tag}`, desc: `${t.posts} Beiträge`, tone: "info", icon: "TrendingUp" })} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-fg-muted transition hover:text-accent">#{t.tag}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PostCard({ p, liked, bookmarked, onLike, onBookmark }: { p: SocialPost; liked: boolean; bookmarked: boolean; onLike: () => void; onBookmark: () => void; }) {
  const toast = useToast();
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 p-4 pb-3">
        <Avatar src={p.avatar} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><span className="font-semibold">{p.author}</span><Icon name="ShieldCheck" size={13} className="text-info-500" /></div>
          <div className="text-xs text-fg-subtle">{p.handle} · {p.time}</div>
        </div>
        <Popover align="end" trigger={<Icon name="MoreHorizontal" size={18} />} triggerClassName="grid size-8 place-items-center rounded-lg text-fg-subtle transition hover:bg-surface-2">
          {(close) => (
            <>
              <PopoverItem icon="Bookmark" onClick={() => { onBookmark(); close(); }}>{bookmarked ? "Nicht mehr merken" : "Merken"}</PopoverItem>
              <PopoverItem icon="Share2" onClick={() => { toast.push({ title: "Link kopiert", tone: "leaf", icon: "Share2" }); close(); }}>Link kopieren</PopoverItem>
              <PopoverItem icon="Flag" danger onClick={() => { toast.push({ title: "Gemeldet", desc: "Danke, wir prüfen es.", tone: "warning", icon: "Flag" }); close(); }}>Melden</PopoverItem>
            </>
          )}
        </Popover>
      </div>
      <p className="px-4 pb-3 text-[15px] leading-relaxed text-fg/90">{p.text}</p>
      {p.image && <SmartImage src={p.image} alt="" className="aspect-video w-full" />}
      <div className="flex items-center gap-0.5 px-1.5 py-1.5 sm:gap-1 sm:px-2">
        <button onClick={onLike} className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition active:scale-95 sm:gap-1.5 sm:px-3", liked ? "text-danger" : "text-fg-muted hover:bg-surface-2")} aria-pressed={liked}>
          <Heart size={18} className={cn(liked && "fill-current")} /> <span className="tnum">{p.likes}</span>
        </button>
        <button onClick={() => { vibrate(); toast.push({ title: "Kommentare", desc: `${p.comments} Antworten`, tone: "info", icon: "MessageCircle" }); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 sm:gap-1.5 sm:px-3"><MessageCircle size={18} /> <span className="tnum">{p.comments}</span></button>
        <button onClick={() => { vibrate(); toast.push({ title: "Geteilt", tone: "leaf", icon: "Share2" }); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 sm:gap-1.5 sm:px-3"><Share2 size={18} /> <span className="tnum">{p.shares}</span></button>
        <button onClick={onBookmark} className={cn("ml-auto grid size-8 place-items-center rounded-lg transition hover:bg-surface-2 sm:size-9", bookmarked ? "text-accent" : "text-fg-muted")} aria-label="Merken"><Bookmark size={18} className={cn(bookmarked && "fill-current")} /></button>
      </div>
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4 pt-1">{p.tags.map((t) => <Badge key={t} tone="leaf">#{t}</Badge>)}</div>
      )}
    </Card>
  );
}
