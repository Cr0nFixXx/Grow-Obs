import { useState, useEffect } from "react";
import { copyText } from "@/lib/share";
import { ChevronDown, ChevronUp, MoreHorizontal, Share2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, BottomSheet, Button, Card, EmptyState, Field, Input, PageHeader, Popover, PopoverItem, Segmented, Select, SkeletonCard, Textarea } from "@/components/ui";
import { vibrate } from "@/lib/format";
import { Reveal } from "@/components/motion";
import { useForumThreads, useSubs, useThread } from "@/data/hooks";
import { useServices } from "@/data/DataContext";
import type { VoteResult } from "@/services/interfaces";
import { shareOrCopy } from "@/lib/share";
import { shareUrl } from "@/lib/routes";
import { config } from "@/lib/config";
import { useCurrentUser } from "@/lib/auth";
import { isPlatformModerator, moderationFor } from "@/lib/moderation-scope";
import { ReportSheet } from "@/components/community/ReportSheet";
import type { ReportKind } from "@/types";
import type { ForumComment, ForumThreadBrief, ForumThreadDetail } from "@/services/interfaces";
import { sortThreads, type ForumSort } from "@/lib/forum-sort";
import { NO_FILTERS, activeFilterCount, filterThreads, sortComments, threadTags, type CommentSort, type ForumFilters, type ForumRange } from "@/lib/forum-filter";

export default function Forum() {
  const { params } = useNav();
  const threadId = params?.threadId;
  return threadId ? <ThreadDetailWrapper threadId={threadId} /> : <ForumList />;
}

function ThreadDetailWrapper({ threadId }: { threadId: string }) {
  const { thread, loading, error, addComment, vote, refresh } = useThread(threadId);
  if (loading) return <SkeletonCard className="mx-auto max-w-3xl" />;
  if (error || !thread) return <EmptyState icon="AlertTriangle" title="Thread nicht gefunden" desc={error ?? "Kein Inhalt."} />;
  return <ThreadDetail t={thread} onComment={addComment} onVote={vote} onChanged={() => void refresh()} />;
}

function ForumList() {
  const { navigate } = useNav();
  const toast = useToast();
  const { threads, loading, error, createThread } = useForumThreads();
  const { subs } = useSubs();
  const [sub, setSub] = useState("Alle");
  const [sort, setSort] = useState<ForumSort>("hot");
  const [filters, setFilters] = useState<ForumFilters>(NO_FILTERS);
  const setFilter = <K extends keyof ForumFilters>(key: K, value: ForumFilters[K]) => setFilters((cur) => ({ ...cur, [key]: value }));
  const [filterOpen, setFilterOpen] = useState(false);
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

  const inSub = sub === "Alle" ? threads : threads.filter((t) => t.sub === sub);
  const list = sortThreads(filterThreads(inSub, filters), sort);
  const activeFilters = activeFilterCount(filters) + (sub !== "Alle" ? 1 : 0);
  const tags = threadTags(threads);
  const panelCount = activeFilters - (filters.query.trim() ? 1 : 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Forum" subtitle="Diskutiere, teile Wissen und hilf anderen Growern." icon="MessagesSquare"
        actions={<Button onClick={() => { setChosenSub(sub === "Alle" ? "" : sub); setSheetOpen(true); }}>+ Thread</Button>}
      />
      <Reveal>
        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Icon name="Search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <Input value={filters.query} onChange={(e) => setFilter("query", e.target.value)} placeholder="Suchen …" aria-label="Threads durchsuchen" className="pl-9" data-testid="forum-search" />
            </div>
            <Button variant={panelCount > 0 || filterOpen ? "secondary" : "ghost"} className="shrink-0 gap-1.5 border border-border" onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen} aria-controls="forum-filter-panel" data-testid="forum-filter-toggle">
              <Icon name="SlidersHorizontal" size={16} />
              <span className="hidden sm:inline">Filter</span>
              {panelCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg" aria-label={`${panelCount} aktiv`}>{panelCount}</span>}
            </Button>
            <Select value={sort} onChange={(e) => setSort(e.target.value as ForumSort)} aria-label="Sortierung" className="w-auto min-w-24 sm:min-w-28" data-testid="forum-sort">
              <option value="hot">Heiß</option>
              <option value="top">Top</option>
              <option value="new">Neu</option>
            </Select>
          </div>
          {filterOpen && (
            <div id="forum-filter-panel" className="space-y-3 border-t border-border pt-3" role="group" aria-label="Filter">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-fg-muted">Bereich
                  <Select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Nach Bereich filtern" data-testid="forum-sub">
                    <option value="Alle">Alle Bereiche</option>
                    {subs.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-fg-muted">Zeitraum
                  <Select value={filters.range} onChange={(e) => setFilter("range", e.target.value as ForumRange)} aria-label="Nach Zeitraum filtern" data-testid="forum-range">
                    <option value="all">Alle Zeit</option>
                    <option value="today">Heute</option>
                    <option value="week">Woche</option>
                    <option value="month">Monat</option>
                  </Select>
                </label>
                {tags.length > 1 && (
                  <label className="grid gap-1 text-xs text-fg-muted">Tag
                    <Select value={filters.tag} onChange={(e) => setFilter("tag", e.target.value)} aria-label="Nach Tag filtern" data-testid="forum-tag">
                      <option value="">Alle Tags</option>
                      {tags.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
                    </Select>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex min-h-9 items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filters.mine} onChange={(e) => setFilter("mine", e.target.checked)} />Nur meine</label>
                <label className="flex min-h-9 items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filters.unanswered} onChange={(e) => setFilter("unanswered", e.target.checked)} />Ohne Antworten</label>
              </div>
            </div>
          )}
        </Card>
      </Reveal>
      {activeFilters > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
          <p role="status" data-testid="forum-result-count">{list.length === 1 ? "1 Thread" : `${list.length} Threads`} gefunden</p>
          <button type="button" className="min-h-10 rounded-lg px-2 text-accent hover:underline sm:min-h-0" onClick={() => { setFilters(NO_FILTERS); setSub("Alle"); }} data-testid="forum-filter-reset">Zurücksetzen</button>
        </div>
      )}
      {list.length === 0 && (
        <EmptyState icon="Search" title={activeFilters > 0 ? "Keine passenden Threads" : "Noch keine Threads"} desc={activeFilters > 0 ? "Lockere die Filter oder suche nach etwas anderem." : "Starte die erste Diskussion mit „+ Thread“."} action={activeFilters > 0 ? <Button variant="secondary" onClick={() => { setFilters(NO_FILTERS); setSub("Alle"); }}>Filter zurücksetzen</Button> : undefined} />
      )}
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

/**
 * Up/Down-Vote mit optimistischer Anzeige. Erneuter Klick auf den aktiven Pfeil nimmt den Vote zurück.
 * Bei Fehler wird der vorherige Stand wiederhergestellt.
 */
function VoteControl({ votes, myVote = 0, onVote, layout = "vertical", size = "md" }: {
  votes: number; myVote?: number; onVote: (delta: 1 | -1 | 0) => Promise<VoteResult>; layout?: "vertical" | "horizontal"; size?: "sm" | "md";
}) {
  const toast = useToast();
  const [state, setState] = useState({ votes, myVote });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState({ votes, myVote }); }, [votes, myVote]);
  const cast = async (dir: 1 | -1) => {
    if (busy) return;
    const next = (state.myVote === dir ? 0 : dir) as 1 | -1 | 0;
    const prev = state;
    vibrate(6);
    setState({ votes: state.votes + next - state.myVote, myVote: next });
    setBusy(true);
    try {
      setState(await onVote(next));
    } catch (e) {
      setState(prev);
      toast.push({ title: "Vote nicht gespeichert", desc: e instanceof Error ? e.message : "Bitte anmelden", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  const icon = size === "sm" ? "size-4" : "size-5";
  const btn = size === "sm" ? "size-8" : "size-9";
  return (
    <div className={cn("flex items-center gap-0.5", layout === "vertical" && "flex-col")} role="group" aria-label="Bewerten">
      <button onClick={(e) => { e.stopPropagation(); void cast(1); }} aria-pressed={state.myVote === 1} aria-label="Upvote" className={cn("grid place-items-center rounded-lg transition", btn, state.myVote === 1 ? "bg-accent/15 text-accent" : "text-fg-subtle hover:bg-accent/12 hover:text-accent")}>
        <ChevronUp className={icon} />
      </button>
      <span className={cn("min-w-6 text-center font-bold tnum", size === "sm" ? "text-xs" : "text-sm", state.myVote === 1 && "text-accent", state.myVote === -1 && "text-info")}>{state.votes}</span>
      <button onClick={(e) => { e.stopPropagation(); void cast(-1); }} aria-pressed={state.myVote === -1} aria-label="Downvote" className={cn("grid place-items-center rounded-lg transition", btn, state.myVote === -1 ? "bg-info/15 text-info" : "text-fg-subtle hover:bg-surface-2")}>
        <ChevronDown className={icon} />
      </button>
    </div>
  );
}

const threadLink = (id?: string) => shareUrl(typeof window !== "undefined" ? window.location.origin : "", "forum", id ? { threadId: id } : null, config.pathRouting);

function ThreadCard({ t, onOpen }: { t: ForumThreadBrief; onOpen: () => void }) {
  const svc = useServices();
  const toast = useToast();
  return (
    <div className="card card-hover flex gap-3 p-4">
      <div className="pt-0.5">
        <VoteControl votes={t.votes} myVote={t.myVote} onVote={(d) => svc.forum.vote(t.id, d)} />
      </div>
      <div className="min-w-0 flex-1">
        <button onClick={onOpen} className="block w-full text-left">
          <div className="flex items-center gap-2 text-xs text-fg-subtle"><Avatar src={t.avatar} name={t.author} size={18} /> {t.author} · <span className="text-accent">{t.sub}</span> · {t.ago}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t.title}</span>
            {t.top && <Badge tone="warning"><Icon name="Trophy" size={11} /> Top</Badge>}
            {t.hidden && <Badge tone="warning">Ausgeblendet</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{t.excerpt}</p>
        </button>
        <div className="mt-2 flex items-center gap-1 text-xs text-fg-subtle">
          <button onClick={onOpen} className="flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-surface-2"><Icon name="MessageCircle" size={13} /> {t.comments} Kommentare</button>
          <button onClick={() => void shareOrCopy({ title: t.title, text: t.excerpt, url: threadLink(t.id) }).then((r) => { if (r === "copied") toast.push({ title: "Link kopiert", tone: "leaf", icon: "Share2" }); })} className="flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-surface-2"><Icon name="Share2" size={13} /> Teilen</button>
          <Badge className="ml-1">{t.tag}</Badge>
        </div>
      </div>
    </div>
  );
}

/** Moderation im Forum (B-89): Melden für alle (außer Eigenes), Ausblenden nur für die Plattform-Moderation. */
interface CommentModeration { moderator: boolean; report: (id: string) => void; toggleHide: (c: ForumComment) => void }

function CommentNode({ c, depth = 0, onReply, mod }: { c: ForumComment; depth?: number; onReply: (text: string, parentId: string) => Promise<void>; mod: CommentModeration }) {
  const svc = useServices();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onReply(text.trim(), c.id);
      setText("");
      setReplying(false);
      toast.push({ title: "Antwort gepostet", tone: "leaf", icon: "MessageCircle" });
    } catch (e) {
      toast.push({ title: "Antwort fehlgeschlagen", desc: e instanceof Error ? e.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  const placeholder = !!c.hidden && !c.body;
  return (
    <div className={cn("flex gap-3", depth > 0 && "mt-3 border-l border-border pl-3")} role="listitem" data-testid="forum-comment">
      <Avatar src={c.avatar} name={placeholder ? "?" : c.author} size={depth > 0 ? 26 : 32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          {!placeholder && <span className="font-medium text-fg">{c.author}</span>}
          <span className="text-fg-subtle">{c.ago}</span>
          {c.hidden && !placeholder && <Badge tone="warning">Ausgeblendet</Badge>}
          {!placeholder && (!c.mine || mod.moderator) && !config.useMock && (
            <span className="ml-auto flex gap-1">
              {!c.mine && !c.hidden && <button type="button" onClick={() => mod.report(c.id)} aria-label="Kommentar melden" className="grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2"><Icon name="Flag" size={14} /></button>}
              {mod.moderator && <button type="button" onClick={() => mod.toggleHide(c)} aria-label={c.hidden ? "Kommentar wieder einblenden" : "Kommentar ausblenden"} className="grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2"><Icon name={c.hidden ? "Eye" : "EyeOff"} size={14} /></button>}
            </span>
          )}
        </div>
        {placeholder
          ? <p className="mt-0.5 text-sm italic text-fg-subtle">[von der Moderation ausgeblendet]</p>
          : <p className="mt-0.5 whitespace-pre-line break-words text-sm text-fg/90">{c.body}</p>}
        <div className="mt-1 flex items-center gap-1 text-xs text-fg-subtle">
          {!placeholder && <VoteControl votes={c.votes} myVote={c.myVote} onVote={(d) => svc.forum.voteComment(c.id, d)} layout="horizontal" size="sm" />}
          {depth < 4 && !placeholder && (
            <button onClick={() => setReplying((v) => !v)} aria-expanded={replying} className="flex min-h-8 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-fg">
              <Icon name="MessageCircle" size={13} /> Antworten
            </button>
          )}
        </div>
        {replying && (
          <div className="mt-2 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Antwort an ${c.author}…`} rows={2} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setReplying(false); setText(""); }}>Abbrechen</Button>
              <Button size="sm" onClick={() => void send()} loading={busy} disabled={!text.trim()}>Antworten</Button>
            </div>
          </div>
        )}
        {c.replies?.map((r) => <CommentNode key={r.id} c={r} depth={depth + 1} onReply={onReply} mod={mod} />)}
      </div>
    </div>
  );
}

const countComments = (list: ForumComment[]): number => list.reduce((n, c) => n + 1 + countComments(c.replies ?? []), 0);

function ThreadDetail({ t, onComment, onVote, onChanged }: { t: ForumThreadDetail; onComment: (text: string, parentId?: string) => Promise<void>; onVote: (delta: 1 | -1 | 0) => Promise<VoteResult>; onChanged: () => void }) {
  const { back } = useNav();
  const toast = useToast();
  const svc = useServices();
  const moderator = isPlatformModerator(useCurrentUser()?.role) && !config.useMock;
  const [reporting, setReporting] = useState<{ kind: ReportKind; id: string } | null>(null);
  const setHidden = async (kind: ReportKind, id: string, hidden: boolean) => {
    try {
      await moderationFor(svc, null).setHidden(kind, id, hidden);
      toast.push({ title: hidden ? "Ausgeblendet" : "Wieder eingeblendet", tone: "leaf", icon: hidden ? "EyeOff" : "Eye" });
      onChanged();
    } catch (e) {
      toast.push({ title: "Aktion fehlgeschlagen", desc: e instanceof Error ? e.message : "", tone: "danger", icon: "AlertTriangle" });
    }
  };
  const commentMod: CommentModeration = { moderator, report: (id) => setReporting({ kind: "forum_comment", id }), toggleHide: (c) => void setHidden("forum_comment", c.id, !c.hidden) };
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentSort, setCommentSort] = useState<CommentSort>("oldest");
  const sortedComments = sortComments(t.commentsList, commentSort);

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
          <div className="flex items-center gap-2 text-xs text-fg-subtle"><Avatar src={t.avatar} name={t.author} size={24} /> {t.author} · <span className="text-accent">{t.sub}</span> · {t.ago} {t.top && <Badge tone="warning" className="ml-1">Top</Badge>}</div>
          <h1 className="mt-2 text-2xl font-bold">{t.title}{t.hidden && <Badge tone="warning" className="ml-2 align-middle">Ausgeblendet</Badge>}</h1>
          <p className="mt-2 whitespace-pre-line text-[15px] text-fg-muted">{t.body || t.excerpt}</p>
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm text-fg-subtle">
            <VoteControl votes={t.votes} myVote={t.myVote} onVote={onVote} layout="horizontal" />
            <button onClick={() => document.getElementById("thread-reply")?.focus()} className="flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-fg"><Icon name="MessageCircle" size={16} /> {t.comments}</button>
            <button onClick={() => void shareOrCopy({ title: t.title, text: t.excerpt, url: threadLink(t.id) }).then((r) => { if (r === "copied") toast.push({ title: "Link kopiert", tone: "leaf", icon: "Share2" }); })} className="flex min-h-9 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-fg"><Share2 className="size-4" /> Teilen</button>
            <Popover align="end" trigger={<MoreHorizontal className="size-4" />} triggerClassName="ml-auto grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg">
              {(close) => (
                <>
                  <PopoverItem icon="Share2" onClick={() => { close(); void copyText(threadLink(t.id)).then((ok) => toast.push(ok ? { title: "Link kopiert", tone: "leaf", icon: "Share2" } : { title: "Kopieren nicht möglich", tone: "warning", icon: "AlertTriangle" })); }}>Link kopieren</PopoverItem>
                  <PopoverItem icon="Bookmark" onClick={() => { close(); toast.push({ title: "Thread gemerkt", tone: "info", icon: "Bookmark" }); }}>Merken</PopoverItem>
                  {!t.mine && !t.hidden && <PopoverItem icon="Flag" danger onClick={() => { close(); setReporting({ kind: "thread", id: t.id }); }}>Melden</PopoverItem>}
                  {moderator && (t.hidden
                    ? <PopoverItem icon="Eye" onClick={() => { close(); void setHidden("thread", t.id, false); }}>Thread wieder einblenden</PopoverItem>
                    : <PopoverItem icon="EyeOff" danger onClick={() => { close(); void setHidden("thread", t.id, true); }}>Thread ausblenden</PopoverItem>)}
                </>
              )}
            </Popover>
          </div>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg-muted">{countComments(t.commentsList)} Kommentare</h2>
            {t.commentsList.length > 1 && <Segmented<CommentSort> value={commentSort} onChange={setCommentSort} options={[{ value: "oldest", label: "Älteste" }, { value: "new", label: "Neu" }, { value: "top", label: "Top" }]} />}
          </div>
          {t.commentsList.length === 0 && <p className="text-sm text-fg-muted">Noch keine Kommentare – schreib den ersten.</p>}
          <div className="space-y-4" role="list">
            {sortedComments.map((c) => <CommentNode key={c.id} c={c} onReply={(text, parentId) => onComment(text, parentId)} mod={commentMod} />)}
          </div>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-4">
          <Textarea id="thread-reply" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Schreibe einen Kommentar…" rows={3} />
          <div className="mt-2 flex justify-end"><Button size="sm" onClick={postComment} loading={posting} disabled={!comment.trim()}>Antworten</Button></div>
        </Card>
      </Reveal>
      <ReportSheet communityId={null} target={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
