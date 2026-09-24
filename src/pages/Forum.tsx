import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, Plus, Share2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, Chip, PageHeader, Popover, PopoverItem, Segmented, Textarea } from "@/components/ui";
import { vibrate } from "@/lib/format";
import { Reveal } from "@/components/motion";
import { forumSubs, forumThreads, sampleComments, type Comment, type ForumThread } from "@/mocks/data";

export default function Forum() {
  const { params } = useNav();
  const t = params?.threadId ? forumThreads.find((x) => x.id === params.threadId) : null;
  return t ? <ThreadDetail t={t} /> : <ForumList />;
}

function ForumList() {
  const { navigate } = useNav();
  const toast = useToast();
  const [sub, setSub] = useState("Alle");
  const [sort, setSort] = useState<"hot" | "top" | "new">("hot");
  const list = [...forumThreads].sort((a, b) => (sort === "top" ? b.votes - a.votes : sort === "new" ? b.comments - a.comments : b.votes - a.votes));

  return (
    <div className="space-y-6">
      <PageHeader title="Forum" subtitle="Diskutiere, teile Wissen und hilf anderen Growern." icon="MessagesSquare"
        actions={<Button onClick={() => toast.push({ title: "Neuer Thread", tone: "leaf", icon: "Plus" })}><Plus className="size-4" /> Thread</Button>} />
      <Reveal>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Chip active={sub === "Alle"} onClick={() => setSub("Alle")}>Alle</Chip>
            {forumSubs.map((s) => <Chip key={s} active={sub === s} onClick={() => setSub(s)}>{s}</Chip>)}
          </div>
          <Segmented value={sort} onChange={setSort} options={[{ value: "hot", label: "Heiß" }, { value: "top", label: "Top" }, { value: "new", label: "Neu" }]} />
        </Card>
      </Reveal>
      <div className="space-y-3">
        {list.map((t, i) => (
          <Reveal key={t.id} delay={i * 0.04}>
            <ThreadCard t={t} onOpen={() => navigate("forum", { threadId: t.id })} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function ThreadCard({ t, onOpen }: { t: ForumThread; onOpen: () => void }) {
  const toast = useToast();
  return (
    <div className="card card-hover flex gap-3 p-4">
      <div className="flex flex-col items-center gap-0.5 pt-1">
        <button onClick={() => { vibrate(); toast.push({ title: "Upvoted", tone: "leaf", icon: "ChevronUp" }); }} className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-accent/12 hover:text-accent" aria-label="Upvote">
          <ChevronUp className="size-5" />
        </button>
        <span className="text-sm font-bold tnum">{t.votes}</span>
        <button onClick={() => { vibrate(); toast.push({ title: "Downvote", tone: "info", icon: "ChevronDown" }); }} className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-2" aria-label="Downvote">
          <ChevronDown className="size-5" />
        </button>
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <Avatar src={t.avatar} size={18} /> {t.author} · <span className="text-accent">{t.sub}</span> · {t.ago}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t.title}</span>
          {t.top && <Badge tone="warning"><Icon name="Trophy" size={11} /> Top</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{t.excerpt}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="flex items-center gap-1"><Icon name="MessageCircle" size={13} /> {t.comments} Kommentare</span>
          <span className="flex items-center gap-1"><Icon name="Share2" size={13} /> Teilen</span>
          <Badge>{t.tag}</Badge>
        </div>
      </button>
    </div>
  );
}

function CommentNode({ c, depth = 0 }: { c: Comment; depth?: number }) {
  const toast = useToast();
  return (
    <div className={cn("flex gap-3", depth > 0 && "mt-3 border-l border-border pl-3")} role="listitem">
      <Avatar src={c.avatar} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-fg">{c.author}</span>
          <span className="text-fg-subtle">{c.ago}</span>
        </div>
        <p className="mt-0.5 text-sm text-fg/90">{c.body}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-fg-subtle">
          <button onClick={() => toast.push({ title: "Upvoted", tone: "leaf", icon: "ChevronUp" })} className="flex items-center gap-1 hover:text-accent"><ChevronUp className="size-3.5" /> {c.votes}</button>
          <button className="hover:text-fg">Antworten</button>
        </div>
        {c.replies?.map((r) => <CommentNode key={r.id} c={r} depth={depth + 1} />)}
      </div>
    </div>
  );
}

function ThreadDetail({ t }: { t: ForumThread }) {
  const { back } = useNav();
  const toast = useToast();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Zum Forum</button>
      <Reveal>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-xs text-fg-subtle"><Avatar src={t.avatar} size={24} /> {t.author} · <span className="text-accent">{t.sub}</span> · {t.ago} {t.top && <Badge tone="warning" className="ml-1">Top</Badge>}</div>
          <h1 className="mt-2 text-2xl font-bold">{t.title}</h1>
          <p className="mt-2 text-[15px] text-fg-muted">{t.excerpt}</p>
          <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-sm text-fg-subtle">
            <button className="flex items-center gap-1 hover:text-accent"><ChevronUp className="size-4" /> {t.votes}</button>
            <button className="flex items-center gap-1 hover:text-fg"><Icon name="MessageCircle" size={16} /> {t.comments}</button>
            <button className="flex items-center gap-1 hover:text-fg"><Share2 className="size-4" /> Teilen</button>
            <Popover align="end" trigger={<MoreHorizontal className="size-4" />} triggerClassName="ml-auto grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg">
              {(close) => (
                <>
                  <PopoverItem icon="Share2" onClick={() => { close(); toast.push({ title: "Link kopiert", tone: "leaf", icon: "Share2" }); }}>Link kopieren</PopoverItem>
                  <PopoverItem icon="Bookmark" onClick={() => { close(); toast.push({ title: "Thread gemerkt", tone: "info", icon: "Bookmark" }); }}>Merken</PopoverItem>
                  <PopoverItem icon="Flag" danger onClick={() => { close(); toast.push({ title: "Gemeldet", desc: "Danke, wir prüfen es.", tone: "warning", icon: "Flag" }); }}>Melden</PopoverItem>
                </>
              )}
            </Popover>
          </div>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-fg-muted">{sampleComments.length + sampleComments.reduce((s, c) => s + (c.replies?.length ?? 0), 0)} Kommentare</h2>
            <div className="space-y-4" role="list">
              {sampleComments.map((c) => <CommentNode key={c.id} c={c} />)}
            </div>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-4">
          <Textarea placeholder="Schreibe einen Kommentar…" rows={3} />
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => toast.push({ title: "Kommentar gepostet", tone: "leaf", icon: "MessageCircle" })}>Antworten</Button></div>
        </Card>
      </Reveal>
    </div>
  );
}
