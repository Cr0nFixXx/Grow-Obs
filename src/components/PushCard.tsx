import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Input, Toggle } from "@/components/ui";
import { useFeatures } from "@/config/FeatureContext";
import { ApiError, http } from "@/lib/api";
import { config } from "@/lib/config";
import { disablePush, enablePush, localSubscription, notificationPermission, PushError, pushSupport, type PushPrefs, type PushState } from "@/lib/push";

const CATEGORIES: { key: "messages" | "community" | "grows" | "other"; label: string; desc: string }[] = [
  { key: "messages", label: "Nachrichten", desc: "Neue Direktnachrichten" },
  { key: "community", label: "Community & Forum", desc: "Antworten und Aktivität" },
  { key: "grows", label: "Grows & Aufgaben", desc: "Erinnerungen und Neues zu deinen Grows" },
  { key: "other", label: "Sonstiges", desc: "Shop, KI und System" },
];

function Row({ label, desc, checked, disabled, onChange }: { label: string; desc?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? "opacity-60" : ""}`}>
      <div><div className="text-sm font-medium">{label}</div>{desc && <div className="text-xs text-fg-subtle">{desc}</div>}</div>
      <Toggle checked={checked} onChange={(v) => { if (!disabled) onChange(v); }} label={label} />
    </div>
  );
}

const errorText = (e: unknown) => (e instanceof PushError || e instanceof ApiError || e instanceof Error ? e.message : "Bitte erneut versuchen.");

/**
 * Push-Benachrichtigungen (B-63): Gerät aktivieren, Kategorien, Vorschau, Ruhezeit, Test. Nur im API-Modus; der Demo-Modus sagt ehrlich,
 * dass Push einen Server braucht (statt einen wirkungslosen Schalter zu zeigen).
 */
export function PushCard() {
  const toast = useToast();
  const { isEnabled } = useFeatures();
  const [state, setState] = useState<PushState | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const support = pushSupport();
  const permission = notificationPermission();
  const featureOn = isEnabled("push");

  const load = useCallback(async () => {
    try {
      const [s, cfg, sub] = await Promise.all([http.get<PushState>("/push"), http.get<{ publicKey: string | null }>("/push/config"), localSubscription().catch(() => null)]);
      setState(s); setPublicKey(cfg.publicKey); setLocal(!!sub); setError(null);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { if (!config.useMock && featureOn) void load(); }, [load, featureOn]);

  if (config.useMock) {
    return (
      <Card className="space-y-2 p-5" data-testid="push-card">
        <h2 className="text-sm font-semibold text-fg-muted">Push-Benachrichtigungen</h2>
        <p className="text-sm text-fg-muted">Im Demo-Modus nicht verfügbar: Push-Meldungen braucht einen Server, der sie senden kann.</p>
      </Card>
    );
  }
  if (!featureOn) return null;

  const active = !!local && !!state?.devices.some((d) => d.current);
  const setPrefs = async (patch: Partial<PushPrefs>) => {
    if (!state) return;
    setState({ ...state, prefs: { ...state.prefs, ...patch } });
    try { setState(await http.put<PushState>("/push/prefs", patch)); }
    catch (e) { toast.push({ title: "Nicht gespeichert", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); void load(); }
  };
  const toggleDevice = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (!publicKey) throw new PushError("failed", "Push ist auf diesem Server nicht eingerichtet.");
        setState(await enablePush(publicKey)); setLocal(true);
        toast.push({ title: "Push aktiviert", desc: "Dieses Gerät erhält Meldungen, wenn du nicht in der App bist.", tone: "leaf", icon: "CheckCircle2" });
      } else { setState(await disablePush()); setLocal(false); }
    } catch (e) { toast.push({ title: on ? "Nicht aktiviert" : "Nicht deaktiviert", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); void load(); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { await http.post("/push/test"); toast.push({ title: "Test gesendet", desc: "Die Meldung sollte gleich erscheinen.", tone: "info", icon: "Info" }); }
    catch (e) { toast.push({ title: "Test fehlgeschlagen", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); }
    finally { setBusy(false); }
  };
  const removeDevice = async (id: string) => {
    setBusy(true);
    try { setState(await http.delete<PushState>(`/push/devices/${id}`)); await load(); }
    catch (e) { toast.push({ title: "Nicht entfernt", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); }
    finally { setBusy(false); }
  };

  const notConfigured = state && !state.configured;
  const prefs = state?.prefs;
  return (
    <Card className="space-y-4 p-5" data-testid="push-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Push-Benachrichtigungen</h2>
        {active && <Badge tone="leaf">Aktiv</Badge>}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error} <button className="underline" onClick={() => void load()}>Erneut laden</button></p>}
      {!state && !error && <p className="text-sm text-fg-subtle">Lade…</p>}
      {notConfigured && <p className="text-sm text-fg-muted" data-testid="push-not-configured">Push ist auf diesem Server nicht eingerichtet. Der Betreiber muss dafür Schlüssel hinterlegen.</p>}
      {state && !notConfigured && support === "needs-install" && (
        <p className="text-sm text-fg-muted" data-testid="push-needs-install">Auf iPhone und iPad funktioniert Push nur in der installierten App (iOS 16.4 oder neuer): In Safari auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen.</p>
      )}
      {state && !notConfigured && support === "unsupported" && <p className="text-sm text-fg-muted">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>}
      {state && !notConfigured && support === "ok" && (
        <>
          <Row label="Auf diesem Gerät aktivieren" desc="Meldungen, wenn die App geschlossen oder im Hintergrund ist" checked={active} disabled={busy} onChange={(v) => void toggleDevice(v)} />
          {permission === "denied" && <p className="text-xs text-danger" role="alert">Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen und aktiviere Push dann erneut.</p>}
        </>
      )}
      {state && prefs && !notConfigured && (
        <div className="space-y-4 border-t border-border pt-4" data-testid="push-prefs">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Worüber?</div>
            {CATEGORIES.map((c) => <Row key={c.key} label={c.label} desc={c.desc} checked={prefs[c.key]} onChange={(v) => void setPrefs({ [c.key]: v })} />)}
          </div>
          <Row label="Vorschau anzeigen" desc="Absender und Text auf dem Sperrbildschirm. Aus: neutrale Meldung „Neue Nachricht“" checked={prefs.showPreview} onChange={(v) => void setPrefs({ showPreview: v })} />
          <div className="space-y-3">
            <Row label="Ruhezeit" desc="In dieser Zeit kommen keine Push-Meldungen" checked={prefs.quietEnabled} onChange={(v) => void setPrefs({ quietEnabled: v, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || prefs.timezone })} />
            {prefs.quietEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-fg-subtle">Von<Input type="time" value={prefs.quietStart} onChange={(e) => e.target.value && void setPrefs({ quietStart: e.target.value })} aria-label="Ruhezeit von" /></label>
                <label className="space-y-1 text-xs text-fg-subtle">Bis<Input type="time" value={prefs.quietEnd} onChange={(e) => e.target.value && void setPrefs({ quietEnd: e.target.value })} aria-label="Ruhezeit bis" /></label>
              </div>
            )}
          </div>
          <p className="text-xs text-fg-subtle">Solange du mit einem Gerät in der App online bist, kommen keine Push-Meldungen – du siehst alles live. Meldungen derselben Art werden gebündelt.</p>
          {active && <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void test()}><Icon name="Bell" size={16} /> Test-Meldung senden</Button>}
          {state.devices.length > 0 && (
            <ul className="space-y-2" data-testid="push-devices">
              <li className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Geräte mit Push</li>
              {state.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3" data-testid="push-device">
                  <Icon name="Smartphone" size={18} className="shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">{d.device} {d.current && <Badge tone="leaf">Dieses Gerät</Badge>}</div>
                  {!d.current && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeDevice(d.id)}>Entfernen</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
