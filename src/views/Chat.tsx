import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Paperclip, Send, Users } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Avatar, Button, Card, EmptyState, PageHeader, SearchInput, SkeletonCard, SmartImage } from "@/components/ui";
import { NewChatModal } from "@/components/NewChat";
import { NewGroupModal } from "@/components/NewGroup";
import { GroupInfoModal, type GroupTab } from "@/components/GroupInfo";
import { InviteBanner } from "@/components/GroupInvites";
import { TopicBar } from "@/components/TopicBar";
import { inviteSummary, showSenderName, writeBlockReason } from "@/lib/chat-groups";
import { config } from "@/lib/config";
import { sendErrorText } from "@/lib/chat-errors";
import { copyText } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/hooks";
import { EmojiPicker, ImagePickButton, insertAtCursor } from "@/components/media";
import { useToast } from "@/components/Toast";
import { useChat } from "@/data/hooks";

const memberLabel = (n: number | undefined) => (n === undefined ? "Gruppe" : n === 1 ? "1 Mitglied" : `${n} Mitglieder`);

export default function Chat() {
  const toast = useToast();
  const { conversations, activeId, setActiveId, messages, msgLoading, send, loading, error, typing, typingIds, notifyTyping, openDirect, live, group, activeTopic, selectTopic, invites, groupActions } = useChat();
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [info, setInfo] = useState<GroupTab | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Letzter fehlgeschlagener Sendeversuch: bleibt sichtbar, bis erneut gesendet, verworfen oder die Unterhaltung gewechselt wird.
  const [failed, setFailed] = useState<{ body: string; image?: string; reason: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // Telefon/Tablet: geöffnete Unterhaltung füllt den Bildschirm (wie ein Messenger), die Seite scrollt nicht mit.
  const isMobile = useMediaQuery("(max-width: 1023px)");

  // Nur den Nachrichtenbereich ans Ende scrollen – `scrollIntoView` würde die ganze Seite mitverschieben.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, [messages, typing, activeId]);

  const deliver = async (body: string, image?: string) => {
    setSending(true);
    try {
      await send(body, image);
      setFailed(null);
      if (!image) setText((cur) => (cur.trim() === body ? "" : cur));
    } catch (error) {
      setFailed({ body, image, reason: sendErrorText(error) });
    } finally {
      setSending(false);
    }
  };
  useEffect(() => { setFailed(null); }, [activeId, activeTopic?.id]);
  const copyMessage = async (value: string) => {
    const ok = await copyText(value);
    toast.push(ok ? { title: "Nachricht kopiert", tone: "leaf", icon: "Check" } : { title: "Kopieren nicht möglich", tone: "danger", icon: "AlertTriangle" });
  };
  const handleSend = () => {
    if (!text.trim() || sending) return;
    void deliver(text.trim());
  };
  const liveLabel = live === "ws" || live === "sse" ? "Live" : live === "polling" ? "Aktualisiert regelmäßig" : live === "connecting" ? "Verbindet …" : "Offline";
  const addEmoji = (emoji: string) => {
    const { next, caret } = insertAtCursor(inputRef.current, text, emoji);
    setText(next);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(caret, caret); });
  };

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Chat nicht geladen" desc={error} />;

  const conv = conversations.find((c) => c.id === activeId) ?? null;
  const blockReason = conv?.isGroup ? writeBlockReason(activeTopic) : null;
  const fullscreen = isMobile && !!conv;

  const modals = (
    <>
      <NewGroupModal open={newGroup} onClose={() => setNewGroup(false)} onCreate={async (input) => {
        const created = await groupActions.create(input);
        toast.push({ title: `Gruppe „${created.name}“ erstellt`, desc: inviteSummary({ invited: created.invites.map((i) => i.userId), skipped: created.skipped }), tone: "leaf", icon: "CheckCircle2" });
      }} />
      {group && <GroupInfoModal open={info !== null} onClose={() => setInfo(null)} group={group} actions={groupActions} initialTab={info ?? "general"} />}
      <NewChatModal open={newChat} onClose={() => setNewChat(false)} onPick={async (person) => { await openDirect(person.id); }} />
    </>
  );
  const pane = (
    <div className={cn("flex min-h-0 min-w-0 flex-col", fullscreen ? "h-full flex-1" : !conv && "hidden lg:flex")}>
          {conv ? (
            <>
              <div className="flex items-center gap-3 border-b border-border p-3">
                <button onClick={() => setActiveId(null)} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 lg:hidden" aria-label="Zurück"><ArrowLeft className="size-5" /></button>
                <Avatar src={conv.avatar} name={conv.name} size={40} status={conv.isGroup ? undefined : conv.online ? "online" : "offline"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{conv.name}</div>
                  {conv.isGroup
                    ? <div data-testid="chat-status" className={cn("text-xs", typing ? "text-leaf-500 dark:text-leaf-400" : "text-fg-subtle")}>{typing ? "schreibt …" : memberLabel(conv.memberCount ?? group?.memberCount)}</div>
                    : <div data-testid="chat-status" className={cn("text-xs", typing || conv.online ? "text-leaf-500 dark:text-leaf-400" : "text-fg-subtle")}>{typing ? "schreibt …" : conv.online ? "Online" : "Offline"}</div>}
                </div>
                {conv.isGroup
                  ? <button onClick={() => setInfo("general")} disabled={!group} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 disabled:opacity-50" aria-label="Gruppen-Info"><Icon name="Info" size={18} /></button>
                  : <button onClick={() => toast.push({ title: conv.name, desc: "Geteilter Grow & Status.", tone: "info", icon: "Info" })} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2" aria-label="Info"><Icon name="Info" size={18} /></button>}
              </div>
              {conv.isGroup && group && <TopicBar topics={group.topics} activeId={activeTopic?.id ?? null} onSelect={selectTopic} onManage={() => setInfo("topics")} />}

              <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4" role="log" aria-live="polite" aria-label="Chat-Verlauf">
                {msgLoading && <SkeletonCard />}
                {conv.isGroup && !msgLoading && messages.length === 0 && <p className="py-6 text-center text-sm text-fg-subtle">In diesem Thema ist noch nichts geschrieben.</p>}
                {messages.map((m, index) => m.kind === "system" ? (
                  <div key={m.id} data-testid="system-line" className="py-1 text-center text-xs text-fg-subtle">{m.text}</div>
                ) : (
                  <div key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                    <div className={cn("group max-w-[78%] rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere]", m.from === "me" ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm bg-surface-2 text-fg")}>
                      {conv.isGroup && showSenderName(messages, index) && <div data-testid="sender-name" className="mb-0.5 text-xs font-semibold text-accent">{m.senderName || "Unbekannt"}</div>}
                      {m.image && <SmartImage src={m.image} alt="Bild-Anhang" className={cn("-mx-1.5 mb-1 aspect-[4/3] w-56 max-w-full rounded-xl", m.text ? "" : "-mt-0.5")} />}
                      {m.text}
                      <div className={cn("mt-0.5 flex items-center justify-between gap-3 text-[10px]", m.from === "me" ? "text-accent-fg/70" : "text-fg-subtle")}>
                        <span>{m.time}</span>
                        {m.text && (
                          <button
                            type="button"
                            onClick={() => void copyMessage(m.text)}
                            aria-label="Nachricht kopieren"
                            title="Nachricht kopieren"
                            className="relative -my-1 grid size-6 place-items-center rounded-md opacity-0 transition-opacity before:absolute before:-inset-2 before:content-[''] hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-70"
                          >
                            <Icon name="Copy" size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {typing && <div className="flex justify-start" data-testid="typing-indicator" aria-live="polite"><div className="rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2 text-sm text-fg-muted">schreibt …</div></div>}
                
              </div>

              {blockReason ? (
                <div data-testid="composer-blocked" role="status" className="flex items-center gap-2 border-t border-border bg-surface-2 p-3 text-sm text-fg-muted"><Icon name="Lock" size={16} />{blockReason}</div>
              ) : (
              <>
              {failed && (
                <div role="alert" data-testid="send-failed" className="flex shrink-0 items-start gap-2 border-t border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Nicht gesendet</div>
                    <div className="text-xs [overflow-wrap:anywhere]">{failed.reason}</div>
                    <div className="mt-1.5 flex gap-2">
                      <Button size="sm" variant="secondary" disabled={sending} onClick={() => void deliver(failed.body, failed.image)}>Erneut senden</Button>
                      <Button size="sm" variant="ghost" onClick={() => setFailed(null)}>Verwerfen</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3">
                <ImagePickButton onUploaded={(path) => deliver(text.trim(), path)} disabled={sending} label="Bild senden" className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-surface-2"><Paperclip className="size-5" /></ImagePickButton>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) notifyTyping(); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Nachricht schreiben…"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-4 text-base outline-none focus:border-accent sm:text-sm"
                />
                <EmojiPicker onPick={addEmoji} />
                <button onClick={handleSend} disabled={sending || !text.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:brightness-110 disabled:opacity-50" aria-label="Senden"><Send className="size-5" /></button>
              </div>
              </>
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6"><EmptyState icon="MessageCircle" title="Kein Chat ausgewählt" desc="Wähle links eine Konversation, um zu starten." /></div>
          )}
    </div>
  );

  // Telefon: Unterhaltung als Vollbild-Ebene über der Seite (Portal: keine Transform-Vorfahren, die `fixed` verschieben).
  if (fullscreen) {
    return createPortal(
      <div data-testid="chat-fullscreen" className="fixed inset-0 z-[45] flex flex-col bg-bg pt-[env(safe-area-inset-top)]">
        {modals}
        {pane}
      </div>,
      document.body,
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat"
        subtitle="Direktnachrichten und Gruppen – schnell & privat."
        icon="MessageCircle"
        actions={<div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {!config.useMock && (
            <span data-testid="live-status" data-live={live} title={live === "polling" ? "Keine Live-Verbindung möglich – neue Nachrichten erscheinen alle paar Sekunden." : undefined} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <span className={cn("size-2 rounded-full", live === "ws" || live === "sse" ? "bg-leaf-500" : live === "polling" ? "bg-warning" : "bg-fg-subtle")} aria-hidden />{liveLabel}
            </span>
          )}
          {!config.useMock && <Button variant="secondary" onClick={() => setNewGroup(true)}><Users className="size-4" />Neue Gruppe</Button>}
          <Button onClick={() => setNewChat(true)}><Icon name="Plus" size={16} />Neue Nachricht</Button>
        </div>}
      />
      {modals}
      <Card className="grid grid-cols-[minmax(0,1fr)] overflow-hidden p-0 lg:h-[calc(100dvh-220px)] lg:min-h-[420px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cn("flex min-h-0 min-w-0 flex-col border-border lg:border-r", conv && "hidden lg:flex")}>
          <div className="border-b border-border p-3"><SearchInput placeholder="Konversation suchen…" /></div>
          <InviteBanner invites={invites} onAccept={groupActions.accept} onDecline={groupActions.decline} />
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && <div className="p-4"><EmptyState icon="MessageCircle" title="Noch keine Unterhaltungen" desc="Starte mit „Neue Nachricht“ ein Gespräch." /></div>}
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={cn("flex w-full items-center gap-3 p-3 text-left transition hover:bg-surface-2", activeId === c.id && "bg-surface-2")}>
                {c.isGroup ? <span className="relative"><Avatar src={c.avatar} name={c.name} size={44} /><span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-surface text-fg-muted ring-1 ring-border" aria-label="Gruppe"><Users className="size-2.5" /></span></span> : <Avatar src={c.avatar} name={c.name} size={44} status={c.online ? "online" : "offline"} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between"><span className={cn("truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.name}</span><span className="text-[10px] text-fg-subtle">{c.time}</span></span>
                  <span className="flex items-center justify-between"><span className={cn("truncate text-xs", typingIds.has(c.id) ? "text-accent" : c.unread > 0 ? "font-medium text-fg" : "text-fg-muted")}>{typingIds.has(c.id) ? "schreibt …" : c.last}</span>{c.unread > 0 && <span data-testid="unread-badge" aria-label={`${c.unread} ungelesen`} className="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">{c.unread}</span>}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {isMobile ? null : pane}
      </Card>
    </div>
  );
}