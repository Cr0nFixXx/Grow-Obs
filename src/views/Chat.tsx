import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Avatar, Card, EmptyState, PageHeader, SearchInput, SkeletonCard, SmartImage } from "@/components/ui";
import { EmojiPicker, ImagePickButton, insertAtCursor } from "@/components/media";
import { useToast } from "@/components/Toast";
import { useChat } from "@/data/hooks";

export default function Chat() {
  const toast = useToast();
  const { conversations, activeId, setActiveId, messages, msgLoading, send, loading, error } = useChat();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const deliver = async (body: string, image?: string) => {
    setSending(true);
    try {
      await send(body, image);
      if (!image) setText("");
    } catch (error) {
      toast.push({ title: "Nicht gesendet", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setSending(false);
    }
  };
  const handleSend = () => {
    if (!text.trim() || sending) return;
    void deliver(text.trim());
  };
  const addEmoji = (emoji: string) => {
    const { next, caret } = insertAtCursor(inputRef.current, text, emoji);
    setText(next);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(caret, caret); });
  };

  if (loading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Chat nicht geladen" desc={error} />;

  const conv = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader title="Chat" subtitle="Direktnachrichten und Gruppen – schnell & privat." icon="MessageCircle" />
      <Card className="grid h-[calc(100dvh-16rem)] min-h-[420px] grid-cols-1 overflow-hidden p-0 sm:h-[calc(100vh-220px)] lg:grid-cols-[320px_1fr]">
        <div className={cn("flex flex-col border-border lg:border-r", conv && "hidden lg:flex")}>
          <div className="border-b border-border p-3"><SearchInput placeholder="Konversation suchen…" /></div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={cn("flex w-full items-center gap-3 p-3 text-left transition hover:bg-surface-2", activeId === c.id && "bg-surface-2")}>
                <Avatar src={c.avatar} size={44} status={c.online ? "online" : "offline"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between"><span className="truncate text-sm font-semibold">{c.name}</span><span className="text-[10px] text-fg-subtle">{c.time}</span></span>
                  <span className="flex items-center justify-between"><span className="truncate text-xs text-fg-muted">{c.last}</span>{c.unread > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">{c.unread}</span>}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={cn("flex flex-col", !conv && "hidden lg:flex")}>
          {conv ? (
            <>
              <div className="flex items-center gap-3 border-b border-border p-3">
                <button onClick={() => setActiveId(null)} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 lg:hidden" aria-label="Zurück"><ArrowLeft className="size-5" /></button>
                <Avatar src={conv.avatar} size={40} status={conv.online ? "online" : "offline"} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{conv.name}</div>
                  <div className="text-xs text-leaf-500 dark:text-leaf-400">{conv.online ? "Online" : "Offline"}</div>
                </div>
                <button onClick={() => toast.push({ title: conv.name, desc: "Geteilter Grow & Status.", tone: "info", icon: "Info" })} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2" aria-label="Info"><Icon name="Info" size={18} /></button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Chat-Verlauf">
                {msgLoading && <SkeletonCard />}
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 text-sm", m.from === "me" ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm bg-surface-2 text-fg")}>
                      {m.image && <SmartImage src={m.image} alt="Bild-Anhang" className={cn("-mx-1.5 mb-1 aspect-[4/3] w-56 max-w-full rounded-xl", m.text ? "" : "-mt-0.5")} />}
                      {m.text}
                      <div className={cn("mt-0.5 text-[10px]", m.from === "me" ? "text-accent-fg/70" : "text-fg-subtle")}>{m.time}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <div className="flex items-center gap-2 border-t border-border p-3">
                <ImagePickButton onUploaded={(path) => deliver(text.trim(), path)} disabled={sending} label="Bild senden" className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-surface-2"><Paperclip className="size-5" /></ImagePickButton>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Nachricht schreiben…"
                  className="h-11 flex-1 rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent"
                />
                <EmojiPicker onPick={addEmoji} />
                <button onClick={handleSend} disabled={sending || !text.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:brightness-110 disabled:opacity-50" aria-label="Senden"><Send className="size-5" /></button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6"><EmptyState icon="MessageCircle" title="Kein Chat ausgewählt" desc="Wähle links eine Konversation, um zu starten." /></div>
          )}
        </div>
      </Card>
    </div>
  );
}