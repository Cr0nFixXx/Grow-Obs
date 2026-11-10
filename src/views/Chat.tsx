import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Send, Users } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Avatar, Button, Card, EmptyState, Modal, PageHeader, SearchInput, SkeletonCard, SwipeLightbox } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { NewChatModal } from "@/components/NewChat";
import { NewGroupModal } from "@/components/NewGroup";
import { GroupInfoModal, type GroupTab } from "@/components/GroupInfo";
import { InviteBanner } from "@/components/GroupInvites";
import { TopicBar } from "@/components/TopicBar";
import { ChatBubble, ReplyQuote } from "@/components/chat-message";
import { LiveChip, StatusLine } from "@/components/status";
import { canDeleteMessage, copyPayload, isSelectable, quoteOf, selectionActions, toggleId } from "@/lib/chat-select";
import { inviteSummary, showSenderName, writeBlockReason } from "@/lib/chat-groups";
import { config } from "@/lib/config";
import { sendErrorText } from "@/lib/chat-errors";
import { copyText } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/hooks";
import { EmojiPicker, insertAtCursor } from "@/components/media";
import { AttachMenu, PendingTray, chatGallery, downloadHref, useAttachmentTray } from "@/components/chat-attachments";
import type { ChatAttachment, ChatMessage } from "@/services/interfaces";
import { useToast } from "@/components/Toast";
import { useNav } from "@/lib/nav";
import { useChat } from "@/data/hooks";

const memberLabel = (n: number | undefined) => (n === undefined ? "Gruppe" : n === 1 ? "1 Mitglied" : `${n} Mitglieder`);

export default function Chat() {
  const toast = useToast();
  const { navigate, params } = useNav();
  const { conversations, activeId, setActiveId, messages, msgLoading, send, deleteMessage, loading, error, typing, typingIds, notifyTyping, openDirect, live, group, activeTopic, selectTopic, invites, groupActions } = useChat();
  // Sprung aus „Auf Status antworten“ (B-97): die genannte Unterhaltung öffnen, sobald sie in der Liste steht.
  const appliedParam = useRef<string | null>(null);
  useEffect(() => {
    const wanted = params?.id;
    if (!wanted || appliedParam.current === wanted || !conversations.some((c) => c.id === wanted)) return;
    appliedParam.current = wanted;
    setActiveId(wanted);
  }, [params?.id, conversations, setActiveId]);
  const [newChat, setNewChat] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [info, setInfo] = useState<GroupTab | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Letzter fehlgeschlagener Sendeversuch: bleibt sichtbar, bis erneut gesendet, verworfen oder die Unterhaltung gewechselt wird.
  const [failed, setFailed] = useState<{ body: string; attachments: ChatAttachment[]; reason: string; replyTo?: string } | null>(null);
  const tray = useAttachmentTray();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pdf, setPdf] = useState<ChatAttachment | null>(null);
  const [toDelete, setToDelete] = useState<ChatMessage[] | null>(null);
  // Auswahl (langer Druck) und Antwort (B-94)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [avatarView, setAvatarView] = useState<{ src: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  // Esc beendet die Auswahl bzw. die Antwort.
  const selectingNow = selected.size > 0;
  useEffect(() => {
    if (!selectingNow && !replyTo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (selectingNow) setSelected(new Set()); else setReplyTo(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectingNow, replyTo]);

  const deliver = async (body: string, attachments: ChatAttachment[] = [], replyId?: string) => {
    setSending(true);
    try {
      await send(body, attachments, replyId);
      setFailed(null);
      setReplyTo((cur) => (cur && cur.id === replyId ? null : cur));
      setText((cur) => (cur.trim() === body ? "" : cur));
      tray.clearSent();
    } catch (error) {
      setFailed({ body, attachments, reason: sendErrorText(error), replyTo: replyId });
    } finally {
      setSending(false);
    }
  };
  useEffect(() => { setFailed(null); tray.reset(); setLightbox(null); setPdf(null); setToDelete(null); setSelected(new Set()); setReplyTo(null); setAvatarView(null); }, [activeId, activeTopic?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const copyMessage = async (value: string) => {
    const ok = await copyText(value);
    toast.push(ok ? { title: "Nachricht kopiert", tone: "leaf", icon: "Check" } : { title: "Kopieren nicht möglich", tone: "danger", icon: "AlertTriangle" });
  };
  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    let done = 0;
    try {
      for (const m of toDelete) { await deleteMessage(m.id); done += 1; }
      setToDelete(null);
      setSelected(new Set());
    } catch (error) {
      toast.push({ title: toDelete.length > 1 ? `${done} von ${toDelete.length} Nachrichten gelöscht` : "Nachricht nicht gelöscht", desc: sendErrorText(error), tone: "danger", icon: "AlertTriangle" });
      if (done > 0) { setToDelete(null); setSelected(new Set()); }
    } finally {
      setDeleting(false);
    }
  };
  const handleSend = () => {
    if (sending || tray.busy || (!text.trim() && !tray.ready.length)) return;
    void deliver(text.trim(), tray.ready, replyTo?.id);
  };
  // Einfügen (Strg+V) und Ziehen von Dateien in den Chat: Bilder als Foto, alles andere als Datei.
  const addDropped = (list: FileList | File[] | null | undefined) => {
    const all = Array.from(list ?? []);
    const images = all.filter((f) => f.type.startsWith("image/"));
    const others = all.filter((f) => !f.type.startsWith("image/"));
    if (images.length) tray.add(images, "image");
    if (others.length) tray.add(others, "file");
  };
  const gallery = useMemo(() => chatGallery(messages, (m) => (m.from === "me" ? "Du" : m.senderName || conversations.find((c) => c.id === activeId)?.name || "Unbekannt")), [messages, conversations, activeId]);
  const liveLabel = live === "ws" || live === "sse" ? "Live" : live === "polling" ? "Aktualisiert regelmäßig" : live === "connecting" ? "Verbindet …" : "Offline";
  const addEmoji = (emoji: string) => {
    const { next, caret } = insertAtCursor(inputRef.current, text, emoji);
    setText(next);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(caret, caret); });
  };

  const startSelect = (m: ChatMessage) => { if (isSelectable(m)) { setSelected(new Set([m.id])); try { navigator.vibrate?.(8); } catch { /* optional */ } } };
  const toggleSelect = (m: ChatMessage) => setSelected((cur) => { const next = toggleId(cur, m.id); return next; });
  const startReply = (m: ChatMessage) => { setSelected(new Set()); setReplyTo(m); requestAnimationFrame(() => inputRef.current?.focus()); };
  const jumpTo = (id: string) => {
    const el = logRef.current?.querySelector<HTMLElement>(`#msg-${CSS.escape(id)}`);
    if (!el) { toast.push({ title: "Original nicht geladen", desc: "Die Nachricht liegt weiter oben im Verlauf.", tone: "info", icon: "Info" }); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("bg-accent/20");
    setTimeout(() => el.classList.remove("bg-accent/20"), 1400);
  };

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Chat nicht geladen" desc={error} />;

  const conv = conversations.find((c) => c.id === activeId) ?? null;
  const blockReason = conv?.isGroup ? writeBlockReason(activeTopic) : null;
  const fullscreen = isMobile && !!conv;
  const isGroupAdmin = !!conv?.isGroup && conv.role === "admin";
  const selectedMessages = messages.filter((m) => selected.has(m.id));
  const actions = selectionActions(selectedMessages, { groupAdmin: isGroupAdmin, canWrite: !blockReason });
  const nameOf = (m: ChatMessage) => (m.from === "me" ? "Du" : m.senderName || conv?.name || "Unbekannt");

  const modals = (
    <>
      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title={toDelete && toDelete.length > 1 ? `${toDelete.length} Nachrichten löschen?` : "Nachricht löschen?"} size="sm" footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Abbrechen</Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>Für alle löschen</Button>
        </div>
      )}>
        <p className="text-sm text-fg-muted">{toDelete && toDelete.length > 1 ? "Die Nachrichten werden" : "Die Nachricht wird"} für alle Teilnehmer gelöscht. Angehängte Bilder und Dateien werden vom Server entfernt. Das lässt sich nicht rückgängig machen.</p>
      </Modal>
      <PdfViewer open={pdf !== null} path={pdf?.path ?? ""} name={pdf?.name || "Dokument.pdf"} downloadUrl={pdf ? downloadHref(pdf.path) : ""} onClose={() => setPdf(null)} />
      <SwipeLightbox open={avatarView !== null} images={avatarView ? [{ src: avatarView.src, alt: `Profilbild von ${avatarView.name}`, caption: avatarView.name }] : []} index={0} onIndexChange={() => undefined} onClose={() => setAvatarView(null)} />
      <SwipeLightbox open={lightbox !== null} images={gallery.images} index={lightbox ?? 0} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
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
              {selected.size > 0 ? (
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 p-3" data-testid="selection-bar" role="toolbar" aria-label="Auswahl">
                  <button type="button" onClick={() => setSelected(new Set())} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-3" aria-label="Auswahl beenden"><Icon name="X" size={18} /></button>
                  <div className="min-w-0 flex-1 text-sm font-semibold" aria-live="polite">{selected.size === 1 ? "1 ausgewählt" : `${selected.size} ausgewählt`}</div>
                  {actions.reply && <button type="button" onClick={() => startReply(selectedMessages[0]!)} className="grid size-10 place-items-center rounded-lg text-fg hover:bg-surface-3" aria-label="Antworten" title="Antworten" data-testid="selection-reply"><Icon name="Reply" size={18} /></button>}
                  {actions.copy && <button type="button" onClick={() => { void copyMessage(copyPayload(messages, selected, nameOf)); setSelected(new Set()); }} className="grid size-10 place-items-center rounded-lg text-fg hover:bg-surface-3" aria-label="Kopieren" title="Kopieren" data-testid="selection-copy"><Icon name="Copy" size={18} /></button>}
                  {actions.remove && <button type="button" onClick={() => setToDelete(selectedMessages)} className="grid size-10 place-items-center rounded-lg text-danger hover:bg-danger/10" aria-label="Löschen" title="Löschen" data-testid="selection-delete"><Icon name="Trash2" size={18} /></button>}
                </div>
              ) : (
              <div className="flex items-center gap-3 border-b border-border p-3">
                <button onClick={() => setActiveId(null)} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 lg:hidden" aria-label="Zurück"><ArrowLeft className="size-5" /></button>
                <button type="button" onClick={() => conv.avatar && setAvatarView({ src: conv.avatar, name: conv.name })} disabled={!conv.avatar} className="shrink-0 rounded-full disabled:cursor-default" aria-label={`Bild von ${conv.name} ansehen`} data-testid="header-avatar">
                  <Avatar src={conv.avatar} name={conv.name} size={40} status={conv.isGroup ? undefined : conv.online ? "online" : "offline"} />
                </button>
                <div className="min-w-0 flex-1">
                  {conv.isGroup || !conv.partnerHandle
                    ? <div className="truncate text-sm font-semibold">{conv.name}</div>
                    : <button type="button" onClick={() => navigate("member", { handle: conv.partnerHandle! })} className="block max-w-full truncate text-left text-sm font-semibold hover:underline" data-testid="header-name">{conv.name}</button>}
                  {conv.isGroup
                    ? <div data-testid="chat-status" className={cn("text-xs", typing ? "text-leaf-500 dark:text-leaf-400" : "text-fg-subtle")}>{typing ? "schreibt …" : memberLabel(conv.memberCount ?? group?.memberCount)}</div>
                    : <div data-testid="chat-status" className={cn("text-xs", typing || conv.online ? "text-leaf-500 dark:text-leaf-400" : "text-fg-subtle")}>{typing ? "schreibt …" : conv.online ? "Online" : "Offline"}</div>}
                  {!conv.isGroup && (conv.partnerStatus || conv.partnerLive) && (
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      <StatusLine status={conv.partnerStatus} className="min-w-0 text-xs" />
                      {conv.partnerHandle && conv.partnerLive && <button type="button" onClick={() => navigate("member", { handle: conv.partnerHandle! })} aria-label="24h-Status ansehen" className="shrink-0"><LiveChip live={conv.partnerLive} /></button>}
                    </div>
                  )}
                </div>
                {conv.isGroup
                  ? <button onClick={() => setInfo("general")} disabled={!group} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 disabled:opacity-50" aria-label="Gruppen-Info"><Icon name="Info" size={18} /></button>
                  : <button onClick={() => (conv.partnerHandle ? navigate("member", { handle: conv.partnerHandle }) : toast.push({ title: conv.name, desc: "Geteilter Grow & Status.", tone: "info", icon: "Info" }))} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2" aria-label={conv.partnerHandle ? "Mitgliedsprofil" : "Info"}><Icon name="Info" size={18} /></button>}
              </div>
              )}
              {conv.isGroup && group && <TopicBar topics={group.topics} activeId={activeTopic?.id ?? null} onSelect={selectTopic} onManage={() => setInfo("topics")} />}

              <div ref={logRef} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files") && !blockReason) e.preventDefault(); }} onDrop={(e) => { if (blockReason || !e.dataTransfer.files.length) return; e.preventDefault(); addDropped(e.dataTransfer.files); }} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4" role="log" aria-live="polite" aria-label="Chat-Verlauf">
                {msgLoading && <SkeletonCard />}
                {conv.isGroup && !msgLoading && messages.length === 0 && <p className="py-6 text-center text-sm text-fg-subtle">In diesem Thema ist noch nichts geschrieben.</p>}
                {messages.map((m, index) => m.kind === "system" ? (
                  <div key={m.id} data-testid="system-line" className="py-1 text-center text-xs text-fg-subtle">{m.text}</div>
                ) : (
                  <ChatBubble
                    key={m.id}
                    m={m}
                    group={!!conv.isGroup}
                    showSender={showSenderName(messages, index)}
                    canDelete={canDeleteMessage(m, isGroupAdmin)}
                    selecting={selected.size > 0}
                    selected={selected.has(m.id)}
                    onSelectStart={startSelect}
                    onToggle={toggleSelect}
                    onReply={startReply}
                    onCopy={(value) => void copyMessage(value)}
                    onDelete={(msg) => setToDelete([msg])}
                    onOpenImage={setLightbox}
                    onOpenPdf={setPdf}
                    onOpenQuote={jumpTo}
                    onOpenProfile={(handle) => navigate("member", { handle })}
                    onViewAvatar={(src, name) => setAvatarView({ src, name })}
                    firstImage={gallery.firstIndex.get(m.id) ?? 0}
                  />
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
                      <Button size="sm" variant="secondary" disabled={sending} onClick={() => void deliver(failed.body, failed.attachments, failed.replyTo)}>Erneut senden</Button>
                      <Button size="sm" variant="ghost" onClick={() => setFailed(null)}>Verwerfen</Button>
                    </div>
                  </div>
                </div>
              )}
              {replyTo && (
                <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface-2/60 px-3 py-2" data-testid="reply-preview">
                  <Icon name="Reply" size={16} className="shrink-0 text-accent" />
                  <ReplyQuote className="min-w-0 flex-1" quote={quoteOf(replyTo, nameOf(replyTo))} onCancel={() => setReplyTo(null)} />
                </div>
              )}
              <PendingTray tray={tray} />
              <div className={cn("flex shrink-0 items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3", !tray.items.length && "border-t border-border")}>
                <AttachMenu tray={tray} disabled={sending} />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) notifyTyping(); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addDropped(e.clipboardData.files); } }}
                  placeholder={tray.items.length ? "Beschriftung hinzufügen …" : "Nachricht schreiben…"}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-4 text-base outline-none focus:border-accent sm:text-sm"
                />
                <EmojiPicker onPick={addEmoji} side="top" align="end" />
                <button onClick={handleSend} disabled={sending || tray.busy || (!text.trim() && !tray.ready.length)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:brightness-110 disabled:opacity-50" aria-label="Senden"><Send className="size-5" /></button>
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
                  <span className="flex items-center justify-between"><span className="flex min-w-0 items-center gap-1.5"><span className={cn("truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.name}</span><LiveChip live={c.partnerLive} className="shrink-0" /></span><span className="text-[10px] text-fg-subtle">{c.time}</span></span>
                  {c.partnerStatus && <StatusLine status={c.partnerStatus} className="text-[11px] text-fg-subtle" />}
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