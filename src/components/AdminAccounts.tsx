import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Field, Input, Modal, Textarea } from "@/components/ui";
import { DELETE_CONFIRM_WORD, DeleteChoiceList, canConfirmDelete, toDeleteOptions, type DeleteChoices } from "@/components/AccountData";
import { useServices } from "@/data/DataContext";
import type { AdminUser, ModerationLogEntry } from "@/services/interfaces";

/** Vorauswahl beim Löschen durch den Betreiber: alles löschen (Spam/Missbrauch). Jeder Schalter bleibt umschaltbar. */
export const ADMIN_DELETE_CHOICES: DeleteChoices = { forum: true, feed: true, comments: true, chat: true, media: true };

/** Konto sperren (B-89): umkehrbar, Sitzungen enden, der Grund wird dem Mitglied beim Anmelden gezeigt. */
export function BanDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const { admin } = useServices();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user) { setReason(""); setError(null); } }, [user]);
  const submit = async () => {
    if (!user) return;
    setBusy(true); setError(null);
    try {
      await admin.ban(user.id, reason.trim() || undefined);
      toast.push({ title: "Konto gesperrt", desc: user.name, tone: "leaf", icon: "ShieldCheck" });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Sperren fehlgeschlagen"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={!!user} onClose={busy ? () => undefined : onClose} title="Konto sperren" size="sm"
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={() => void submit()}>Sperren</Button></>}>
      <div className="space-y-4" data-testid="ban-dialog">
        <p className="text-sm text-fg-muted">{user?.name} wird sofort abgemeldet und kann sich nicht mehr anmelden. Beiträge und Daten bleiben erhalten; du kannst die Sperre jederzeit aufheben.</p>
        <Field label="Grund (optional, sieht das Mitglied beim Anmelden)"><Textarea value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Spam in mehreren Communities" /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/** Fremdes Konto endgültig löschen (B-89): dieselben Schalter wie beim Selbstlöschen, bestätigt mit dem Betreiber-Passwort. */
export function DeleteUserDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const { admin } = useServices();
  const toast = useToast();
  const [choices, setChoices] = useState<DeleteChoices>(ADMIN_DELETE_CHOICES);
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user) { setChoices(ADMIN_DELETE_CHOICES); setPassword(""); setWord(""); setReason(""); setError(null); } }, [user]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !canConfirmDelete(password, word)) return;
    setBusy(true); setError(null);
    try {
      await admin.deleteUser(user.id, { password, options: toDeleteOptions(choices), reason: reason.trim() || undefined });
      toast.push({ title: "Konto gelöscht", desc: user.name, tone: "leaf", icon: "ShieldCheck" });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={!!user} onClose={busy ? () => undefined : onClose} title="Fremdes Konto löschen">
      <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate data-testid="admin-delete-form">
        <p className="text-sm text-fg-muted">
          <strong>{user?.name}</strong> ({user?.email}) wird <strong>sofort und endgültig</strong> gelöscht. Grows, Profil, Follower und Benachrichtigungen verschwinden immer.
          Ist die Person alleiniger Admin einer Community, übernimmt das dienstälteste Mitglied. Für die übrigen Inhalte entscheidest du:
        </p>
        <DeleteChoiceList choices={choices} onChange={setChoices} />
        <Field label="Grund fürs Protokoll (optional)"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Dein Passwort"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label={`Tippe ${DELETE_CONFIRM_WORD} zur Bestätigung`}><Input value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={busy || !canConfirmDelete(password, word)}>{busy ? "Lösche…" : "Konto löschen"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const ACTION_LABEL: Record<string, string> = {
  ban: "Konto gesperrt", unban: "Sperre aufgehoben", delete_account: "Konto gelöscht", hide: "Ausgeblendet", unhide: "Wieder eingeblendet",
  report_hide: "Meldung: ausgeblendet", report_dismiss: "Meldung: kein Verstoß",
};
const KIND_LABEL: Record<string, string> = { post: "Beitrag", comment: "Kommentar", thread: "Thread", forum_comment: "Forum-Kommentar" };
export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

/** Moderationsprotokoll (B-89): wer hat wann was getan – Konten, Meldungen und Ausblenden (Plattform und Communities). */
export function ModerationLog() {
  const { admin } = useServices();
  const [items, setItems] = useState<ModerationLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const page = await admin.moderationLog(offset);
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items])); setHasMore(page.hasMore); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Protokoll nicht geladen"); }
    finally { setLoading(false); }
  }, [admin]);
  useEffect(() => { void load(0); }, [load]);
  return (
    <Card className="p-4 sm:p-5" data-testid="moderation-log">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">Moderationsprotokoll</h2><Button size="sm" variant="ghost" onClick={() => void load(0)}>Aktualisieren</Button></div>
      <p className="mt-2 text-sm text-fg-muted">Dauerhaft gespeichert: wer, was, wann und warum – für Kontosperren, Löschungen, Meldungen und Ausblenden.</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="py-8 text-center text-sm text-fg-muted">Noch keine Moderationsaktionen.</p>}
      <ul className="mt-4 divide-y divide-border">
        {items.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm" data-testid="log-entry">
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={e.action === "ban" || e.action === "delete_account" ? "danger" : "info"}>{actionLabel(e.action)}</Badge>{e.targetKind && <span className="text-xs text-fg-subtle">{KIND_LABEL[e.targetKind] ?? e.targetKind}</span>}</div>
              <p className="mt-1 text-fg-muted"><span className="font-medium text-fg">{e.actor}</span>{e.target ? <> → <span className="font-medium text-fg">{e.target}</span></> : null}{e.reason ? ` · „${e.reason}“` : ""}</p>
            </div>
            <time className="shrink-0 text-xs text-fg-subtle" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString("de-DE")}</time>
          </li>
        ))}
      </ul>
      {hasMore && <div className="mt-3 flex justify-center"><Button variant="secondary" loading={loading} onClick={() => void load(items.length)}>Mehr laden</Button></div>}
    </Card>
  );
}
