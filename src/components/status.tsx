import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { BottomSheet, Button, Chip, Field, Input, Modal, Segmented, Textarea } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { ProfileImageMenu } from "@/components/profile-extras";
import { useToast } from "@/components/Toast";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { useNav } from "@/lib/nav";
import { useServices } from "@/data/DataContext";
import { invalidate } from "@/data/hooks";
import { LIVE_TEXT_MAX, STATUS_TEXT_MAX, type LiveStatus, type StatusLine as StatusLineData, type StatusVisibility } from "@/services/interfaces";
import { STATUS_EMOJIS, STATUS_VISIBILITY_DESC, STATUS_VISIBILITY_OPTIONS, liveIsActive, liveRemaining, liveTextError, statusTextError } from "@/lib/status";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Bitte noch einmal versuchen.");

/** Textstatus als eine Zeile; ohne Status nichts. */
export function StatusLine({ status, className }: { status?: StatusLineData | null; className?: string }) {
  if (!status || (!status.text && !status.emoji)) return null;
  return (
    <p className={cn("flex min-w-0 items-center gap-1.5 text-sm text-fg-muted", className)} data-testid="status-line">
      {status.emoji && <span aria-hidden="true">{status.emoji}</span>}
      {status.text && <span className="min-w-0 truncate">{status.text}</span>}
    </p>
  );
}

/** Kleiner Hinweis „24h-Status“ (Chat-Liste und -Kopf). */
export function LiveChip({ live, className }: { live?: LiveStatus | null; className?: string }) {
  if (!liveIsActive(live)) return null;
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-leaf/15 px-2 py-0.5 text-[11px] font-semibold text-leaf", className)} data-testid="live-chip"><Icon name="Clock" size={11} />24h-Status</span>;
}

/** Aktiver 24h-Status. Fremd: mit „Antworten“; eigen: mit „Entfernen“. */
export function LiveStatusCard({ live, name, onReply, onRemove, removing }: { live: LiveStatus; name?: string; onReply?: () => void; onRemove?: () => void; removing?: boolean }) {
  // Restzeit tickt minütlich; nach Ablauf verschwindet die Karte.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id); }, []);
  const remaining = liveRemaining(live.expiresAt);
  if (!remaining || !liveIsActive(live)) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-leaf/30 bg-leaf/5" data-testid="live-status">
      {live.image && (
        <ProfileImageMenu label="Status-Foto" src={live.image} className="block w-full">
          <img src={live.image} alt={name ? `Status-Foto von ${name}` : "Status-Foto"} className="max-h-64 w-full object-cover" loading="lazy" />
        </ProfileImageMenu>
      )}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-leaf"><span className="flex items-center gap-1"><Icon name="Clock" size={12} />24h-Status</span><span className="font-medium text-fg-subtle" data-testid="live-remaining">{remaining}</span></div>
        {live.text && <p className="whitespace-pre-line break-words text-sm" data-testid="live-text">{live.text}</p>}
        {(onReply || onRemove) && (
          <div className="flex flex-wrap gap-2">
            {onReply && <Button size="sm" variant="secondary" onClick={onReply} data-testid="live-reply"><Icon name="Reply" size={14} /> Antworten</Button>}
            {onRemove && <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" loading={removing} onClick={onRemove} data-testid="live-remove"><Icon name="Trash2" size={14} /> Entfernen</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Antwort auf den 24h-Status: öffnet den Direktchat, die Nachricht zitiert den Status (der Server setzt den Zitattext). */
export function StatusReplyModal({ open, onClose, userId, name, live }: { open: boolean; onClose: () => void; userId: string; name: string; live: LiveStatus }) {
  const { chat } = useServices();
  const { navigate } = useNav();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setText(""); setError(""); } }, [open]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const conversation = await chat.startDirect(userId);
      await chat.sendMessage(conversation.id, text.trim(), undefined, undefined, undefined, true);
      invalidate("chat");
      onClose();
      navigate("chat", { id: conversation.id });
    } catch (e) {
      setError(errorText(e));
      toast.push({ title: "Nicht gesendet", desc: errorText(e), tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`Auf Status von ${name} antworten`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button><Button onClick={send} loading={busy} disabled={!text.trim()} data-testid="status-reply-send">Senden</Button></>}>
      <div className="space-y-3">
        <blockquote className="rounded-lg border-l-4 border-leaf bg-surface-2 px-3 py-2 text-sm text-fg-muted" data-testid="status-reply-quote">{live.text || "📷 Foto"}</blockquote>
        <Field label="Deine Antwort"><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus /></Field>
        {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
        <p className="text-xs text-fg-subtle">Die Antwort geht als Direktnachricht an {name}.</p>
      </div>
    </Modal>
  );
}

/** Eigener Status: dauerhafter Textstatus und 24h-Status samt Sichtbarkeit (Inhalt der Status-Schublade). */
export function StatusEditor() {
  const me = useCurrentUser();
  const { updateProfile } = useAuth();
  const toast = useToast();
  const savedEmoji = me.status?.emoji ?? "";
  const savedText = me.status?.text ?? "";
  const savedVisibility: StatusVisibility = me.status?.visibility ?? "all";
  const [emoji, setEmoji] = useState(savedEmoji);
  const [text, setText] = useState(savedText);
  const [visibility, setVisibility] = useState<StatusVisibility>(savedVisibility);
  const [savingLine, setSavingLine] = useState(false);
  useEffect(() => { setEmoji(savedEmoji); setText(savedText); setVisibility(savedVisibility); }, [savedEmoji, savedText, savedVisibility]);
  const lineError = statusTextError(text);
  const lineChanged = emoji !== savedEmoji || text.trim() !== savedText || visibility !== savedVisibility;

  const [liveText, setLiveText] = useState("");
  const [liveImage, setLiveImage] = useState("");
  const [liveVisibility, setLiveVisibility] = useState<StatusVisibility>(me.live?.visibility ?? savedVisibility);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const active = liveIsActive(me.live) ? me.live! : null;
  const liveError = liveText || liveImage ? liveTextError(liveText, !!liveImage) : "";

  const run = async (fn: () => Promise<void>, ok: string, set: (b: boolean) => void) => {
    set(true);
    try { await fn(); toast.push({ title: ok, tone: "leaf", icon: "CheckCircle2" }); }
    catch (e) { toast.push({ title: "Nicht gespeichert", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); }
    finally { set(false); }
  };

  return (
    <div className="space-y-6" data-testid="status-editor">
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="MessageCircle" size={16} /> Textstatus</h2>
        <p className="text-xs text-fg-subtle">Eine Zeile unter deinem Namen, bleibt bis du sie änderst. Leer lassen entfernt ihn.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Emoji wählen">
          {STATUS_EMOJIS.map((e) => <Chip key={e} active={emoji === e} aria-pressed={emoji === e} onClick={() => setEmoji(emoji === e ? "" : e)}>{e}</Chip>)}
        </div>
        <div className="flex gap-2">
          <Input className="w-16 text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Status-Emoji" data-testid="status-emoji" />
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={STATUS_TEXT_MAX} placeholder="Woche 3 Blüte, Ernte in Sicht" aria-label="Statustext" aria-invalid={!!lineError} data-testid="status-text" />
        </div>
        {lineError && <p role="alert" className="text-xs font-medium text-danger">{lineError}</p>}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-fg-muted">Sichtbar für</div>
          <Segmented value={visibility} onChange={setVisibility} options={STATUS_VISIBILITY_OPTIONS} />
          <p className="text-xs text-fg-subtle">{STATUS_VISIBILITY_DESC[visibility]}</p>
        </div>
        <Button onClick={() => void run(() => updateProfile({ statusEmoji: emoji.trim(), statusText: text.trim(), statusVisibility: visibility }), "Status gespeichert", setSavingLine)} loading={savingLine} disabled={!lineChanged || !!lineError} data-testid="status-save">Status übernehmen</Button>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Clock" size={16} /> 24h-Status</h2>
        <p className="text-xs text-fg-subtle">Ein kurzer Moment mit optionalem Foto. Er verschwindet nach 24 Stunden, das Foto wird dann gelöscht. Es gibt immer nur einen.</p>
        {active && <LiveStatusCard live={active} onRemove={() => void run(() => updateProfile({ live: null }), "24h-Status entfernt", setRemoving)} removing={removing} />}
        <Field label={active ? "Neuen 24h-Status setzen (ersetzt den aktuellen)" : "Dein 24h-Status"} hint={`${liveText.length}/${LIVE_TEXT_MAX}`}>
          <Textarea rows={2} value={liveText} onChange={(e) => setLiveText(e.target.value)} maxLength={LIVE_TEXT_MAX} placeholder="Heute Abend Topping, die Damen sind happy." data-testid="live-input" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <ImagePickButton onUploaded={setLiveImage} label="Status-Foto wählen" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-surface-2">
            <Icon name="Camera" size={16} /> {liveImage ? "Foto ändern" : "Foto hinzufügen"}
          </ImagePickButton>
          {liveImage && <><img src={liveImage} alt="Vorschau des Status-Fotos" className="size-10 rounded-lg object-cover" /><Button size="sm" variant="ghost" onClick={() => setLiveImage("")}>Foto entfernen</Button></>}
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-fg-muted">Sichtbar für</div>
          <Segmented value={liveVisibility} onChange={setLiveVisibility} options={STATUS_VISIBILITY_OPTIONS} />
          <p className="text-xs text-fg-subtle">{STATUS_VISIBILITY_DESC[liveVisibility]}</p>
        </div>
        {liveError && <p role="alert" className="text-xs font-medium text-danger">{liveError}</p>}
        <Button onClick={() => void run(async () => { await updateProfile({ live: { text: liveText.trim(), image: liveImage, visibility: liveVisibility } }); setLiveText(""); setLiveImage(""); }, "24h-Status veröffentlicht", setPublishing)} loading={publishing} disabled={!!liveError || (!liveText.trim() && !liveImage)} data-testid="live-publish">Für 24 Stunden veröffentlichen</Button>
      </div>
    </div>
  );
}

/** Schlanker Einstieg im Profilkopf (ersetzt die frühere Status-Karte): zeigt den Status, ein Klick öffnet die Schublade. */
export function StatusButton() {
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const line = me.status && (me.status.text || me.status.emoji) ? me.status : null;
  const live = liveIsActive(me.live) ? me.live! : null;
  // Restzeit nachführen, damit der Hinweis nach Ablauf verschwindet.
  const [, tick] = useState(0);
  useEffect(() => { if (!live) return; const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id); }, [live]);
  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOpen(true)} data-testid="status-open"
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs text-fg-muted transition hover:border-accent/40 hover:text-fg">
          {line ? (
            <>{line.emoji && <span aria-hidden="true">{line.emoji}</span>}<span className="min-w-0 truncate">{line.text || "Status"}</span></>
          ) : (
            <><Icon name="Plus" size={12} />Status setzen</>
          )}
          <Icon name="Pencil" size={11} className="shrink-0 opacity-60" />
        </button>
        {live && <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-leaf/15 px-2.5 text-[11px] font-semibold text-leaf" data-testid="live-chip"><Icon name="Clock" size={11} />24h-Status · {liveRemaining(live.expiresAt)}</button>}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Mein Status">
        <StatusEditor />
      </BottomSheet>
    </>
  );
}
