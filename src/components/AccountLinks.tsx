import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Button, CollapsibleCard, Field, Input } from "@/components/ui";
import { ApiError, http } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * E-Mail-Links (B-87). Die Links aus Mails tragen den Token im URL-FRAGMENT (`/#verify=…`, `/#reset=…`): Das Fragment
 * erreicht nie einen Server-Log oder Referrer. Die Seite löst den Token per POST ein (Mail-Scanner, die Links nur per
 * GET abrufen, verbrauchen ihn deshalb nicht).
 */
export type AccountLink = { kind: "verify" | "reset"; token: string };

export function parseAccountLink(hash: string): AccountLink | null {
  const match = /^#(verify|reset)=([A-Za-z0-9_-]{20,100})$/.exec(hash);
  return match ? { kind: match[1] as AccountLink["kind"], token: match[2]! } : null;
}

/** Entfernt den Token aus der Adresszeile (Verlauf, Lesezeichen, Teilen). */
export function clearAccountLink() {
  try { window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`); } catch { /* ignore */ }
}

export const MIN_PASSWORD = 12;
const shell = "relative z-10 mx-auto grid min-h-dvh w-full max-w-md content-center gap-4 p-4";
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? (err.status === 429 ? "Zu viele Versuche. Bitte warte einige Minuten." : err.message) : fallback;

/** Seite für einen Link aus einer Mail: Adresse bestätigen oder neues Passwort festlegen. */
export function AccountLinkPage({ link, onDone }: { link: AccountLink; onDone: () => void }) {
  return link.kind === "verify" ? <VerifyEmail token={link.token} onDone={onDone} /> : <ResetPassword token={link.token} onDone={onDone} />;
}

function VerifyEmail({ token, onDone }: { token: string; onDone: () => void }) {
  const { refreshUser } = useAuth();
  const [state, setState] = useState<{ phase: "working" } | { phase: "ok"; kind: "verify_email" | "change_email" } | { phase: "error"; message: string }>({ phase: "working" });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode: der Token darf nur einmal eingelöst werden
    started.current = true;
    http.post<{ kind: "verify_email" | "change_email" }>("/auth/verify-email", { token })
      .then(async (res) => { setState({ phase: "ok", kind: res.kind }); await refreshUser(); })
      .catch((err) => setState({ phase: "error", message: errorText(err, "Der Link konnte nicht geprüft werden. Bitte Verbindung prüfen und den Link erneut öffnen.") }));
  }, [token, refreshUser]);

  return (
    <main className={shell} data-testid="verify-email-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">E-Mail-Adresse bestätigen</h1>
        {state.phase === "working" && <p role="status" className="text-sm text-fg-muted">Link wird geprüft…</p>}
        {state.phase === "ok" && (
          <p role="status" className="text-sm text-fg-muted" data-testid="verify-ok">
            {state.kind === "change_email" ? "Deine neue Adresse ist bestätigt und jetzt die Adresse deines Kontos." : "Deine Adresse ist bestätigt. Willkommen bei Grow|Observer!"}
          </p>
        )}
        {state.phase === "error" && <p role="alert" className="text-sm text-danger" data-testid="verify-error">{state.message}</p>}
      </div>
      {state.phase !== "working" && <Button className="w-full" onClick={onDone}>{state.phase === "ok" ? "Weiter" : "Zur Startseite"}</Button>}
    </main>
  );
}

function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const { logout } = useAuth();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD) { setError(`Das neue Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`); return; }
    if (next !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
    setBusy(true); setError(null);
    try {
      await http.post("/auth/reset-password", { token, newPassword: next });
      setDone(true);
      logout(); // der Server hat alle Sitzungen beendet – lokal ebenfalls abmelden
    } catch (err) { setError(errorText(err, "Das Passwort konnte nicht gesetzt werden.")); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <main className={shell} data-testid="reset-password-page">
        <h1 className="text-2xl font-bold">Passwort geändert</h1>
        <p role="status" className="text-sm text-fg-muted" data-testid="reset-ok">Dein neues Passwort ist gesetzt. Aus Sicherheitsgründen wurdest du überall abgemeldet – melde dich jetzt mit dem neuen Passwort an.</p>
        <Button className="w-full" onClick={onDone}>Zur Anmeldung</Button>
      </main>
    );
  }
  return (
    <main className={shell} data-testid="reset-password-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Neues Passwort festlegen</h1>
        <p className="text-sm text-fg-muted">Wähle ein neues Passwort für dein Konto. Danach wirst du auf allen Geräten abgemeldet.</p>
      </div>
      <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Neues Passwort" hint={`Mindestens ${MIN_PASSWORD} Zeichen`}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Neues Passwort wiederholen"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-danger" data-testid="reset-error">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>Passwort speichern</Button>
      </form>
      <Button variant="ghost" className="w-full" onClick={onDone}>Abbrechen</Button>
    </main>
  );
}

/** „Passwort vergessen?“ auf der Anmeldeseite: schickt (bei bekannter Adresse) einen Link; die Antwort ist immer gleich. */
export function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    setBusy(true); setError(null);
    try {
      await http.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) { setError(errorText(err, "Die Anfrage konnte nicht gesendet werden.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="forgot-password">
      <div>
        <h1 className="text-2xl font-bold">Passwort vergessen?</h1>
        <p className="mt-1 text-sm text-fg-muted">Wir schicken dir einen Link zum Zurücksetzen. Er gilt 1 Stunde.</p>
      </div>
      {sent ? (
        <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm" data-testid="forgot-sent">
          Wenn zu dieser Adresse ein Konto existiert, ist eine E-Mail unterwegs. Schau auch im Spam-Ordner nach.
        </p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
          <Field label="E-Mail"><Input type="email" autoComplete="email" placeholder="du@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <p role="alert" className="text-sm text-danger" data-testid="forgot-error">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>Link senden</Button>
        </form>
      )}
      <button type="button" className="text-sm text-accent hover:underline" onClick={onBack}>Zurück zur Anmeldung</button>
    </div>
  );
}

/** Formular „Adresse ändern“: neue Adresse + aktuelles Passwort; der Link geht an die NEUE Adresse. */
function ChangeEmailForm({ onSent }: { onSent: (email: string) => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) { setError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    if (!password) { setError("Bitte gib dein Passwort ein."); return; }
    setBusy(true); setError(null);
    try {
      await http.post("/auth/email", { newEmail: newEmail.trim(), password });
      setPassword("");
      onSent(newEmail.trim());
      setNewEmail("");
    } catch (err) { setError(errorText(err, "Die Adresse konnte nicht geändert werden.")); }
    finally { setBusy(false); }
  };
  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate data-testid="change-email-form">
      <Field label="Neue E-Mail-Adresse"><Input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Field>
      <Field label="Passwort zur Bestätigung"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>Bestätigungslink senden</Button>
    </form>
  );
}

/** Profil → Sicherheit: aktuelle Adresse und Wechsel mit Bestätigung. */
export function EmailCard({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);
  return (
    <CollapsibleCard icon="Mail" title="E-Mail-Adresse" className="p-5" testId="email-card">
      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-medium break-all" data-testid="current-email">{user?.email ?? "–"}</span>{" "}
          <span className="text-fg-subtle">{user?.emailVerified ? "· bestätigt" : "· noch nicht bestätigt"}</span>
        </p>
        <ChangeEmailForm onSent={(email) => { setSentTo(email); onChanged?.(); toast.push({ title: "Link verschickt", desc: `Bitte bestätige ${email}.`, tone: "leaf", icon: "Mail" }); }} />
        {sentTo && <p role="status" className="text-sm text-fg-muted" data-testid="email-change-sent">Wir haben einen Link an {sentTo} geschickt. Deine bisherige Adresse bleibt gültig, bis du ihn öffnest.</p>}
        <p className="text-xs text-fg-subtle">Der Link gilt 24 Stunden. An deine bisherige Adresse geht ein Hinweis.</p>
      </div>
    </CollapsibleCard>
  );
}

/**
 * Vollbild-Sperre bis zur Bestätigung der Adresse (nur wenn der Server Mails versenden kann): erneut senden, Tippfehler
 * korrigieren, nach dem Klick auf den Link weitermachen oder abmelden.
 */
export function EmailVerificationGate() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showChange, setShowChange] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  // Wer den Link in einem anderen Tab/auf dem Handy geöffnet hat, kommt beim Zurückkehren automatisch weiter.
  useEffect(() => {
    const onFocus = () => void refreshUser();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  const resend = async () => {
    setBusy(true); setError(null); setInfo(null);
    try {
      await http.post("/auth/resend-verification");
      setCooldown(60);
      setInfo(`Die E-Mail ist unterwegs an ${user?.email ?? "deine Adresse"}. Schau auch im Spam-Ordner nach.`);
    } catch (err) { setError(errorText(err, "Die E-Mail konnte nicht gesendet werden.")); }
    finally { setBusy(false); }
  };

  return (
    <main className={shell} data-testid="email-gate">
      <div className="space-y-2">
        <div className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="Mail" size={24} /></div>
        <h1 className="text-2xl font-bold">Bitte bestätige deine E-Mail-Adresse</h1>
        <p className="text-sm text-fg-muted">
          Wir haben einen Link an <strong className="break-all" data-testid="gate-email">{user?.email ?? "deine Adresse"}</strong> geschickt. Öffne ihn, dann kannst du Grow|Observer nutzen.
        </p>
      </div>
      {info && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm" data-testid="gate-info">{info}</p>}
      {error && <p role="alert" className="text-sm text-danger" data-testid="gate-error">{error}</p>}
      <Button className="w-full" onClick={() => void resend()} loading={busy} disabled={cooldown > 0}>{cooldown > 0 ? `Erneut senden in ${cooldown} s` : "Link erneut senden"}</Button>
      <Button variant="secondary" className="w-full" onClick={() => void refreshUser()}>Ich habe bestätigt</Button>
      {showChange ? (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="text-sm font-medium">Falsche Adresse? Gib die richtige ein.</p>
          <ChangeEmailForm onSent={(email) => { setShowChange(false); setInfo(`Link an ${email} geschickt. Sobald du ihn öffnest, ist die Adresse bestätigt.`); toast.push({ title: "Link verschickt", desc: email, tone: "leaf", icon: "Mail" }); }} />
        </div>
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setShowChange(true)}>Falsche Adresse ändern</Button>
      )}
      <Button variant="ghost" className="w-full" onClick={logout}>Abmelden</Button>
    </main>
  );
}
