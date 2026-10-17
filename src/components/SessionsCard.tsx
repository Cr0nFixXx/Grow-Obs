import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ApiError, http } from "@/lib/api";
import { config } from "@/lib/config";

interface SessionInfo { id: string; device: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean }

const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string) => fmt.format(new Date(iso));

/** Sitzungen & Geräte (B-54): aktive Anmeldungen ansehen, einzeln beenden oder überall abmelden. Nur im API-Modus. */
export function SessionsCard({ onSignedOut }: { onSignedOut?: () => void }) {
  const toast = useToast();
  const { logoutAll } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await http.get<SessionInfo[]>("/auth/sessions"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sitzungen konnten nicht geladen werden.");
    }
  }, []);
  useEffect(() => { if (!config.useMock) void load(); }, [load]);

  if (config.useMock) return null;

  const end = async (s: SessionInfo) => {
    setBusy(s.id);
    try {
      await http.delete(`/auth/sessions/${s.id}`);
      toast.push({ title: "Sitzung beendet", desc: s.device, tone: "leaf", icon: "CheckCircle2" });
      await load();
    } catch (e) {
      toast.push({ title: "Nicht beendet", desc: e instanceof ApiError ? e.message : "Bitte erneut versuchen.", tone: "danger", icon: "AlertTriangle" });
    } finally { setBusy(null); }
  };
  const endAll = async () => {
    setBusy("all");
    try {
      await logoutAll();
      onSignedOut?.();
    } catch (e) {
      toast.push({ title: "Abmeldung fehlgeschlagen", desc: e instanceof ApiError ? e.message : "Bitte erneut versuchen.", tone: "danger", icon: "AlertTriangle" });
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-3 p-5" data-testid="sessions-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Sitzungen &amp; Geräte</h2>
        {sessions && <span className="text-xs text-fg-subtle">{sessions.length} aktiv</span>}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error} <button className="underline" onClick={() => void load()}>Erneut laden</button></p>}
      {!sessions && !error && <p className="text-sm text-fg-subtle">Lade…</p>}
      <ul className="space-y-2">
        {sessions?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3" data-testid="session-row">
            <Icon name="Smartphone" size={18} className="shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{s.device}</span>
                {s.current && <Badge tone="leaf">Dieses Gerät</Badge>}
              </div>
              <div className="text-xs text-fg-subtle">Zuletzt aktiv {when(s.lastSeenAt)} · läuft ab {when(s.expiresAt)}</div>
            </div>
            {!s.current && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void end(s)}>Beenden</Button>}
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => void endAll()}>
        <Icon name="LogOut" size={16} /> Auf allen Geräten abmelden
      </Button>
      <p className="text-xs text-fg-subtle">Beendet jede Anmeldung dieses Kontos, auch diese. Nutze das, wenn ein Gerät verloren ging.</p>
    </Card>
  );
}
