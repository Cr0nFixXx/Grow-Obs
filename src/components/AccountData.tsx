import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Button, CollapsibleCard, Field, Input, Modal, Toggle } from "@/components/ui";
import { ApiError, http } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";

/** Bestätigungswort im Löschdialog (B-74); der Server vergleicht ohne Rücksicht auf Groß-/Kleinschreibung. */
export const DELETE_CONFIRM_WORD = "LÖSCHEN";

export interface AccountBlockers {
  platformAdmin: boolean;
  communities: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  blocked: boolean;
}

export interface DeleteChoices { forum: boolean; feed: boolean; comments: boolean; chat: boolean; media: boolean }
/** Vorauswahl: Inhalte anonym stehen lassen, Bilder/Dateien in diesen Inhalten behalten (Eigner-Entscheidung); alles ist umschaltbar. */
export const DEFAULT_CHOICES: DeleteChoices = { forum: false, feed: false, comments: false, chat: false, media: false };

/** Schalter → Server-Optionen (`true` = löschen, sonst anonym stehen lassen). */
export function toDeleteOptions(c: DeleteChoices) {
  const pick = (v: boolean) => (v ? "delete" : "keep");
  return { forum: pick(c.forum), feed: pick(c.feed), comments: pick(c.comments), chat: pick(c.chat), media: c.media ? "remove" : "keep" } as const;
}

export function canConfirmDelete(password: string, word: string): boolean {
  return password.length > 0 && word.trim().toLocaleUpperCase("de-DE") === DELETE_CONFIRM_WORD;
}

/** Datenexport: Passwort → 2 Minuten gültiger Link → Browser lädt das ZIP (JSON + alle Dateien). */
export function ExportCard() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Bitte gib dein Passwort ein."); return; }
    setBusy(true); setError(null);
    try {
      const { path } = await http.post<{ path: string }>("/auth/export", { password });
      setPassword("");
      toast.push({ title: "Export gestartet", desc: "Der Download beginnt gleich. Bei vielen Dateien kann es etwas dauern.", tone: "leaf", icon: "CheckCircle2" });
      window.location.assign(`${config.apiBaseUrl}${path}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Du hast den Export schon dreimal angefordert. Bitte versuche es in einer Stunde erneut." : err.message) : "Export konnte nicht gestartet werden.");
    } finally { setBusy(false); }
  };

  return (
    <CollapsibleCard icon="Download" title="Meine Daten herunterladen" className="p-5" testId="export-card">
      <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
        <p className="text-sm text-fg-muted">Ein ZIP mit allen deinen Daten als lesbare JSON-Datei (Konto, Grows, Messwerte, Beiträge, Chats …) und allen hochgeladenen Bildern und Dateien.</p>
        <Field label="Passwort zur Bestätigung">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="secondary" className="w-full" disabled={busy}>{busy ? "Bereite vor…" : "Daten herunterladen"}</Button>
      </form>
    </CollapsibleCard>
  );
}

const CHOICE_ROWS: { key: keyof Omit<DeleteChoices, "media">; label: string; hint: string }[] = [
  { key: "forum", label: "Forum", hint: "Themen und Antworten" },
  { key: "feed", label: "Community-Feed", hint: "Beiträge und ihre Kommentare" },
  { key: "comments", label: "Kommentare", hint: "an Wiki-Artikeln, Sorten und Co." },
  { key: "chat", label: "Chat-Nachrichten", hint: "in Direkt- und Gruppenchats" },
];

/** Die fünf Schalter des Löschdialogs (Eigenlöschung B-74 und Löschung durch den Betreiber B-89). */
export function DeleteChoiceList({ choices, onChange }: { choices: DeleteChoices; onChange: (next: DeleteChoices) => void }) {
  return (
    <ul className="space-y-2" data-testid="delete-choices">
      {CHOICE_ROWS.map((row) => (
        <li key={row.key} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{row.label}</div>
            <div className="text-xs text-fg-subtle">{row.hint} · {choices[row.key] ? "werden gelöscht" : "bleiben anonym stehen"}</div>
          </div>
          <Toggle checked={choices[row.key]} onChange={(v) => onChange({ ...choices, [row.key]: v })} label={`${row.label} löschen`} />
        </li>
      ))}
      <li className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Bilder und Dateien</div>
          <div className="text-xs text-fg-subtle">in stehen bleibenden Inhalten · {choices.media ? "werden entfernt" : "bleiben erhalten"}</div>
        </div>
        <Toggle checked={choices.media} onChange={(v) => onChange({ ...choices, media: v })} label="Bilder und Dateien entfernen" />
      </li>
    </ul>
  );
}

/** Dialog „Konto endgültig löschen“: Blocker prüfen, Auswahl treffen, Passwort + Wort LÖSCHEN. */
export function DeleteAccountDialog({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [blockers, setBlockers] = useState<AccountBlockers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<DeleteChoices>(DEFAULT_CHOICES);
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBlockers(null); setLoadError(null); setPassword(""); setWord(""); setError(null); setChoices(DEFAULT_CHOICES);
    let alive = true;
    http.get<AccountBlockers>("/auth/account/check")
      .then((b) => { if (alive) setBlockers(b); })
      .catch((e) => { if (alive) setLoadError(e instanceof ApiError ? e.message : "Prüfung fehlgeschlagen."); });
    return () => { alive = false; };
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canConfirmDelete(password, word)) return;
    setBusy(true); setError(null);
    try {
      await http.delete("/auth/account", undefined, { password, confirm: word.trim(), options: toDeleteOptions(choices) });
      onDeleted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        void http.get<AccountBlockers>("/auth/account/check").then(setBlockers).catch(() => undefined);
      }
      setError(err instanceof ApiError ? (err.status === 429 ? "Zu viele Versuche. Bitte warte einige Minuten." : err.message) : "Konto konnte nicht gelöscht werden.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="Konto endgültig löschen">
      <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate data-testid="delete-account-form">
        {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
        {!blockers && !loadError && <p className="text-sm text-fg-subtle">Prüfe…</p>}

        {blockers?.blocked && (
          <div role="alert" className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm" data-testid="delete-blockers">
            <p className="font-semibold">Dein Konto kann noch nicht gelöscht werden.</p>
            {blockers.platformAdmin && <p>Du bist der letzte Plattform-Admin. Ernenne zuerst jemand anderen.</p>}
            {blockers.communities.length > 0 && <p>Alleiniger Admin der Community: {blockers.communities.map((c) => c.name).join(", ")}. Ernenne einen weiteren Admin oder gib die Community ab.</p>}
            {blockers.groups.length > 0 && <p>Alleiniger Admin der Gruppe: {blockers.groups.map((g) => g.name).join(", ")}. Ernenne einen weiteren Admin.</p>}
          </div>
        )}

        {blockers && !blockers.blocked && (
          <>
            <p className="text-sm text-fg-muted">
              Das Löschen ist <strong>sofort und endgültig</strong>. Deine Grows samt Fotos und Messwerten, dein Profil, Follower, Einstellungen und Benachrichtigungen werden immer gelöscht.
              Bei den folgenden Inhalten entscheidest du: <em>Löschen</em> oder <em>anonym stehen lassen</em>.
            </p>
            <DeleteChoiceList choices={choices} onChange={setChoices} />
            <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-fg-subtle">
              <Icon name="Info" size={16} className="mt-0.5 shrink-0" />
              <span>Was stehen bleibt, erscheint unter „Gelöschtes Mitglied“, ohne Profil und ohne Verknüpfung zu dir. Eigene Chat-Nachrichten, die gelöscht werden, bleiben als „Nachricht gelöscht“ sichtbar. Deine Daten kannst du vorher als ZIP herunterladen.</span>
            </p>
            <Field label="Passwort">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label={`Tippe ${DELETE_CONFIRM_WORD} zur Bestätigung`}>
              <Input value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
            </Field>
          </>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Abbrechen</Button>
          {blockers && !blockers.blocked && (
            <Button type="submit" variant="danger" className="flex-1" disabled={busy || !canConfirmDelete(password, word)}>{busy ? "Lösche…" : "Konto löschen"}</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** „Konto & Daten“ im Profil: Export und Löschen. Im Demo-Modus nur ein Hinweis. */
export function AccountData({ onDeleted }: { onDeleted: () => void }) {
  const { logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const done = () => {
    setOpen(false);
    toast.push({ title: "Konto gelöscht", desc: "Alle deine Daten wurden nach deiner Auswahl entfernt.", tone: "leaf", icon: "CheckCircle2" });
    logout();
    onDeleted();
  };
  return (
    <div className="space-y-4">
      {!config.useMock && <ExportCard />}
      <CollapsibleCard icon="AlertTriangle" tone="danger" title="Gefahrenzone" className="border-danger/30 p-5" bodyClassName="space-y-2" testId="danger-zone">
        {config.useMock ? (
          <p className="text-sm text-fg-muted">Im Demo-Modus gibt es kein echtes Konto, daher auch keine Löschung.</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">Lösche dein Konto unwiderruflich. Du entscheidest, was mit Forum, Feed, Kommentaren, Chats und Dateien passiert.</p>
            <Button variant="danger" onClick={() => setOpen(true)}>Konto löschen…</Button>
            <DeleteAccountDialog open={open} onClose={() => setOpen(false)} onDeleted={done} />
          </>
        )}
      </CollapsibleCard>
    </div>
  );
}
