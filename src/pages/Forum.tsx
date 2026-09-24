import { useState } from "react";
import { ChevronDown, ChevronUp, MoreHorizontal, Share2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, BottomSheet, Button, Card, Chip, EmptyState, Field, Input, PageHeader, Popover, PopoverItem, Segmented, Select, SkeletonCard, Textarea } from "@/components/ui";
import { vibrate } from "@/lib/format";
import { Reveal } from "@/components/motion";
import { useForumThreads, useSubs, useThread } from "@/data/hooks";
import type { ForumComment, ForumThreadBrief, ForumThreadDetail } from "@/services/interfaces";

export default function Forum() {
  const { params } = useNav();
  const threadId = params?.threadId;
  return threadId ? <ThreadDetailWrapper threadId={threadId} /> : <ForumList />;
}

function ThreadDetailWrapper({ threadId }: { threadId: string }) {
  const { thread, loading, error, addComment } = useThread(threadId);
  if (loading) return <SkeletonCard className="mx-auto max-w-3xl" />;
  if (error || !thread) return <EmptyState icon="AlertTriangle" title="Thread nicht gefunden" desc={error ?? "Kein Inhalt."} />;
  return <ThreadDetail t={thread} onComment={addComment} />;
}

function ForumList() {
  const { navigate } = useNav();
  const toast = useToast();
  const { threads, loading, error, createThread } = useForumThreads();
  const { subs } = useSubs();
  const [sub, setSub] = useState("Alle");
  const [sort, setSort] = useState<"hot" | "top" | "new">("hot");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [chosenSub, setChosenSub] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    try {
      const t = await createThread({ title: title.trim(), sub: chosenSub || subs[0] || "r/GrowTagebuch", text: text.trim() });
      setSheetOpen(false);
      setTitle(""); setText("");
      toast.push({ title: "Thread erstellt", desc: t.title, tone: "leaf", icon: "MessageCircle" });
      navigate("forum", { threadId: t.id });
    } catch (e) {
      toast.push({ title: "Fehler", desc: e instanceof Error ? e.message : "Thread konnte nicht erstellt werden", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Forum nicht geladen" desc={error} />;

  const list = (sub === "Alle" ? threads : threads.filter((t) => t.sub === sub))
    .slice()
    .sort((a, b) => (sort === "top" ? b.votes - a.votes : sort === "new" ? b.comments - a.comments : b.votes - a.votes));

  return (
    <div className="space-y-6">
      <PageHeader title="Forum" subtitle="Diskutiere, teile Wissen und hilf anderen Growern." icon="MessagesSquare"
        actions={<Button onClick={() => { setChosenSub(sub === "Alle" ? "" : sub); setSheetOpen(true); }}>+ Thread</Button>}
      />
      <Reveal>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Chip active={sub === "Alle"} onClick={() => setSub("Alle")}>Alle</Chip>
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

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Neuer Thread">
        <div className="space-y-4">
          <Field label="Titel">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Worum geht es?" />
          </Field>
          <Field label="Bereich">
            <Select value={chosenSub} onChange={(e) => setChosenSub(e.target.value)}>
              {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Text">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Teile dein Wissen oder stell eine Frage…" />
          </Field>
          <Button className="w-full" onClick={publish} loading={saving} disabled={!title.trim() || !text.trim()}>
            Thread veröffentlichen
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ThreadCard({ t, onOpen }: { t: ForumThreadBrief; onOpen: () => void }) {
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
        <div className="flex items-center gap-2 text-xs text-fg-subtle"><Avatar src={t.avatar} size={18} /> {t.author} · <span className="text-accent">{t.sub}</span> · {t.ago}</div>
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

function CommentNode({ c, depth = 0 }: { c: ForumComment; depth?: number }) {
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

function ThreadDetail({ t, onComment }: { t: ForumThreadDetail; onComment: (text: string) => Promise<void> }) {
  const { back } = useNav();
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const postComment = async () => {
    if (!comment.trim() || posting) return;
    setPosting(true);
    try {
      await onComment(comment.trim());
      setComment("");
      toast.push({ title: "Kommentar gepostet", tone: "leaf", icon: "MessageCircle" });
    } catch (e) {
      toast.push({ title: "Fehler", desc: e instanceof Error ? e.message : "Kommentar fehlgeschlagen", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><Icon name="ArrowLeft" size={16} /> Zum Forum</button>
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
          <h2 className="mb-4 text-sm font-semibold text-fg-muted">{t.commentsList.length + t.commentsList.reduce((s, c) => s + (c.replies?.length ?? 0), 0)} Kommentare</h2>
          <div className="space-y-4" role="list">
            {t.commentsList.map((c) => <CommentNode key={c.id} c={c} />)}
          </div>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-4">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Schreibe einen Kommentar…" rows={3} />
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={postComment} loading={posting} disabled={!comment.trim()}>Antworten</Button></div>
        </Card>
      </Reveal>
    </div>
  );
}