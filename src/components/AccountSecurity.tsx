import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { SessionsCard } from "@/components/SessionsCard";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError, http } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";

export const MIN_PASSWORD_LENGTH = 12;

/** Prüft das Formular; liefert die erste Fehlermeldung oder `null`. */
export function validatePasswordChange(current: string, next: string, confirm: string): string | null {
  if (!current) return "Bitte gib dein aktuelles Passwort ein.";
  if (next.length < MIN_PASSWORD_LENGTH) return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (next === current) return "Das neue Passwort muss sich vom aktuellen unterscheiden.";
  if (next !== confirm) return "Die Passwörter stimmen nicht überein.";
  return null;
}

/** Passwort ändern (B-55): verlangt das aktuelle Passwort; andere Geräte werden abgemeldet, dieses bleibt angemeldet. */
export function PasswordCard({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePasswordChange(current, next, confirm);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await http.post("/auth/password", { currentPassword: current, newPassword: next });
      setCurrent(""); setNext(""); setConfirm("");
      toast.push({ title: "Passwort geändert", desc: "Andere Geräte wurden abgemeldet.", tone: "leaf", icon: "CheckCircle2" });
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Zu viele Versuche. Bitte warte einige Minuten." : err.message) : "Passwort konnte nicht geändert werden.");
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-5" data-testid="password-card">
      <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Lock" size={16} /> Passwort ändern</h2>
        <Field label="Aktuelles Passwort">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Neues Passwort" hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Neues Passwort wiederholen">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="secondary" className="w-full" disabled={busy}>{busy ? "Speichere…" : "Passwort ändern"}</Button>
        <p className="text-xs text-fg-subtle">Alle anderen Geräte werden dabei abgemeldet. Dieses Gerät bleibt angemeldet.</p>
      </form>
    </Card>
  );
}

interface LoginEventInfo { id: string; event: "login" | "login_failed" | "register" | "password_changed" | "role_changed"; device: string; createdAt: string }
const EVENT_LABEL: Record<LoginEventInfo["event"], string> = {
  login: "Angemeldet", login_failed: "Anmeldung fehlgeschlagen", register: "Konto erstellt", password_changed: "Passwort geändert", role_changed: "Rolle geändert",
};
const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Anmeldeprotokoll (B-55): Zeit, Ereignis, Gerät der letzten 90 Tage – ohne IP-Adresse. */
export function LoginHistoryCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [events, setEvents] = useState<LoginEventInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setEvents(await http.get<LoginEventInfo[]>("/auth/login-history"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Anmeldeprotokoll konnte nicht geladen werden.");
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <Card className="space-y-3 p-5" data-testid="login-history-card">
      <h2 className="text-sm font-semibold text-fg-muted">Anmeldeprotokoll</h2>
      {error && <p role="alert" className="text-sm text-danger">{error} <button className="underline" onClick={() => void load()}>Erneut laden</button></p>}
      {!events && !error && <p className="text-sm text-fg-subtle">Lade…</p>}
      {events?.length === 0 && <p className="text-sm text-fg-subtle">Noch keine Einträge.</p>}
      <ul className="space-y-2">
        {events?.map((ev) => {
          const failed = ev.event === "login_failed";
          return (
            <li key={ev.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3" data-testid="login-event-row">
              <Icon name={failed ? "AlertTriangle" : "CheckCircle2"} size={18} className={failed ? "shrink-0 text-danger" : "shrink-0 text-leaf-600"} />
              <div className="min-w-0 flex-1">
                <div className={failed ? "text-sm font-medium text-danger" : "text-sm font-medium"}>{EVENT_LABEL[ev.event]}</div>
                <div className="truncate text-xs text-fg-subtle">{fmt.format(new Date(ev.createdAt))} · {ev.device}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">Es werden nur Zeit, Gerät und Ergebnis gespeichert, keine IP-Adresse. Einträge werden nach 90 Tagen gelöscht.</p>
    </Card>
  );
}

/** Sicherheitsbereich im Profil: Passwort, Sitzungen & Geräte, Anmeldeprotokoll. Nur im API-Modus. */
export function AccountSecurity({ onSignedOut }: { onSignedOut?: () => void }) {
  const [version, setVersion] = useState(0);
  if (config.useMock) return null;
  return (
    <div className="space-y-4">
      <PasswordCard onChanged={() => setVersion((v) => v + 1)} />
      <SessionsCard onSignedOut={onSignedOut} refreshKey={version} />
      <LoginHistoryCard refreshKey={version} />
    </div>
  );
}

/**
 * Vollbild-Sperre für Konten mit Einmalpasswort (B-58, z. B. per `admin:create` angelegt): Bis das Passwort geändert ist,
 * lehnt der Server alles andere ab. Nach dem Wechsel lädt `refreshUser` das Konto neu und die App öffnet sich.
 */
export function ForcedPasswordChange() {
  const { user, refreshUser, logout } = useAuth();
  return (
    <main className="relative z-10 mx-auto grid min-h-dvh w-full max-w-md content-center gap-4 p-4" data-testid="forced-password-change">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Neues Passwort festlegen</h1>
        <p className="text-sm text-fg-muted">
          {user?.name ? `${user.name}, dein` : "Dein"} Konto wurde mit einem Einmalpasswort angelegt. Aus Sicherheitsgründen musst du jetzt ein eigenes
          Passwort wählen, bevor du die App nutzen kannst.
        </p>
      </div>
      <PasswordCard onChanged={() => void refreshUser()} />
      <Button variant="ghost" className="w-full" onClick={logout}>Abmelden</Button>
    </main>
  );
}
