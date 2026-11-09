import { cn } from "@/utils/cn";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MessageAttachments, messageAttachments } from "@/components/chat-attachments";
import { useLongPress } from "@/lib/long-press";
import { quoteBody, quoteName } from "@/lib/chat-select";
import type { ChatAttachment, ChatMessage, ChatReplyQuote } from "@/services/interfaces";

const hoverBtn = "relative -my-1 grid size-6 place-items-center rounded-md opacity-0 transition-opacity before:absolute before:-inset-2 before:content-[''] hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-70";

/** Zitat einer Antwort (in der Blase und als Vorschau über dem Eingabefeld). */
export function ReplyQuote({ quote, mine, onOpen, onCancel, className }: { quote: ChatReplyQuote; mine?: boolean; onOpen?: () => void; onCancel?: () => void; className?: string }) {
  const body = (
    <>
      <span className={cn("block truncate text-xs font-semibold", mine ? "text-accent-fg" : "text-accent")}>{quoteName(quote)}</span>
      <span className={cn("line-clamp-2 block text-xs", quote.deleted && "italic", mine ? "text-accent-fg/80" : "text-fg-muted")}>{quoteBody(quote)}</span>
    </>
  );
  const box = cn("min-w-0 flex-1 rounded-lg border-l-2 px-2 py-1 text-left", mine ? "border-accent-fg/60 bg-black/10" : "border-accent bg-black/5 dark:bg-white/5");
  return (
    <div className={cn("flex items-start gap-1", className)} data-testid="reply-quote">
      {onOpen ? <button type="button" onClick={onOpen} className={box} aria-label={`Zur Nachricht von ${quoteName(quote)} springen`}>{body}</button> : <div className={box}>{body}</div>}
      {onCancel && <button type="button" onClick={onCancel} aria-label="Antwort abbrechen" className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"><Icon name="X" size={16} /></button>}
    </div>
  );
}

export interface ChatBubbleProps {
  m: ChatMessage;
  /** Gruppenchat? */
  group: boolean;
  /** Absendername/Avatar zeigen (erste Nachricht einer Serie, nur Gruppen). */
  showSender: boolean;
  canDelete: boolean;
  selecting: boolean;
  selected: boolean;
  onSelectStart: (m: ChatMessage) => void;
  onToggle: (m: ChatMessage) => void;
  onReply: (m: ChatMessage) => void;
  onCopy: (text: string) => void;
  onDelete: (m: ChatMessage) => void;
  onOpenImage: (index: number) => void;
  onOpenPdf: (a: ChatAttachment) => void;
  onOpenQuote: (id: string) => void;
  onOpenProfile: (handle: string) => void;
  onViewAvatar: (src: string, name: string) => void;
  /** Index des ersten Bildes dieser Nachricht in der Galerie. */
  firstImage: number;
}

/** Eine Nachricht im Verlauf: Blase, Zitat, Anhänge, Auswahl per langem Druck, Avatar → Bild, Name → Profil (B-94). */
export function ChatBubble(p: ChatBubbleProps) {
  const { m } = p;
  const press = useLongPress(() => { if (!p.selecting) p.onSelectStart(m); else p.onToggle(m); });
  const mine = m.from === "me";

  const sender = p.group && !mine && (
    <div className="w-7 shrink-0 self-end">
      {p.showSender && (
        <button type="button" onClick={() => m.senderAvatar && p.onViewAvatar(m.senderAvatar, m.senderName || "Mitglied")} disabled={!m.senderAvatar} aria-label={`Profilbild von ${m.senderName || "Mitglied"}`} className="rounded-full disabled:cursor-default" data-testid="sender-avatar">
          <Avatar src={m.senderAvatar} name={m.senderName || "?"} size={28} />
        </button>
      )}
    </div>
  );
  const senderName = p.group && p.showSender && (
    m.senderHandle
      ? <button type="button" onClick={() => p.onOpenProfile(m.senderHandle!)} data-testid="sender-name" className="mb-0.5 block max-w-full truncate text-left text-xs font-semibold text-accent hover:underline">{m.senderName || "Unbekannt"}</button>
      : <div data-testid="sender-name" className="mb-0.5 text-xs font-semibold text-accent">{m.senderName || "Unbekannt"}</div>
  );

  if (m.deleted) {
    return (
      <div data-testid="message-deleted" id={`msg-${m.id}`} className={cn("flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}>
        {sender}
        <div className="max-w-[78%] rounded-2xl border border-dashed border-border px-3.5 py-2 text-sm italic text-fg-subtle">
          {p.group && p.showSender && <div className="mb-0.5 text-xs font-semibold not-italic">{m.senderName || "Unbekannt"}</div>}
          🚫 {mine ? "Du hast diese Nachricht gelöscht" : "Diese Nachricht wurde gelöscht"}
          <div className="mt-0.5 text-[10px] not-italic">{m.time}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`msg-${m.id}`}
      data-testid="chat-message"
      data-selected={p.selected || undefined}
      {...press.handlers}
      onClick={() => { if (press.consumeClick()) return; if (p.selecting) p.onToggle(m); }}
      className={cn("flex select-none items-end gap-1.5 rounded-xl transition-colors", mine ? "justify-end" : "justify-start", p.selecting && "cursor-pointer", p.selected && "bg-accent/15")}
    >
      {p.selecting && !mine && <span aria-hidden className={cn("mb-2 grid size-5 shrink-0 place-items-center rounded-full border", p.selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong")}>{p.selected && <Icon name="Check" size={12} />}</span>}
      {sender}
      <div className={cn("group max-w-[78%] rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere]", mine ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm bg-surface-2 text-fg")}>
        {senderName}
        {m.replyTo && <ReplyQuote quote={m.replyTo} mine={mine} className="mb-1" onOpen={p.selecting ? undefined : () => p.onOpenQuote(m.replyTo!.id)} />}
        <div className={cn(p.selecting && "pointer-events-none")}>
  <MessageAttachments attachments={messageAttachments(m)} mine={mine} hasText={!!m.text} onOpenImage={(i) => p.onOpenImage(p.firstImage + i)} onOpenPdf={p.onOpenPdf} />
        </div>
        {m.text}
        <div className={cn("mt-0.5 flex items-center justify-between gap-3 text-[10px]", mine ? "text-accent-fg/70" : "text-fg-subtle")}>
          <span>{m.time}</span>
          {!p.selecting && (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => p.onReply(m)} aria-label="Auf Nachricht antworten" title="Antworten" className={hoverBtn}><Icon name="Reply" size={13} /></button>
              {p.canDelete && <button type="button" onClick={() => p.onDelete(m)} aria-label="Nachricht löschen" title="Nachricht löschen" className={hoverBtn}><Icon name="Trash2" size={13} /></button>}
              {m.text && <button type="button" onClick={() => p.onCopy(m.text)} aria-label="Nachricht kopieren" title="Nachricht kopieren" className={hoverBtn}><Icon name="Copy" size={13} /></button>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
