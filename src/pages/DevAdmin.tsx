import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatures } from "@/config/FeatureContext";
import { defaultFeatures, featureMeta, STORAGE_KEY, type FeatureKey } from "@/config/features";
import { config } from "@/lib/config";
import { checkBackend, systemInfo, type HealthResult } from "@/lib/diagnostics";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Chip, PageHeader, SearchInput, SkeletonCard, Tabs, Toggle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/motion";
import { currentUser } from "@/mocks/data";
import { cn } from "@/utils/cn";

type Tab = "overview" | "flags" | "users" | "logs" | "diagnostics";

/** Lokales Audit-Log (localStorage) — zeigt Betreiber-Aktionen dieser Installation. */
const LOG_KEY = "go-dev-log";
const MAX_LOG = 40;

interface LogEntry {
  id: string;
  ts: string;
  action: string;
  detail: string;
  tone: "leaf" | "info" | "warning" | "danger";
}

function readLog(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
  } catch {
    return [];
  }
}

function appendLog(action: string, detail: string, tone: LogEntry["tone"] = "info"): LogEntry[] {
  const next: LogEntry[] = [
    { id: `l-${Date.now()}`, ts: new Date().toLocaleTimeString("de-DE"), action, detail, tone },
    ...readLog(),
  ].slice(0, MAX_LOG);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const mockUsers = [
  { id: "u-me", name: currentUser.name, handle: currentUser.handle, role: "platform_admin", status: "aktiv", grows: 6 },
  { id: "u-2", name: "Lena B.", handle: "@lena_grows", role: "member", status: "aktiv", grows: 4 },
  { id: "u-3", name: "soilWizard", handle: "@soilwizard", role: "moderator", status: "aktiv", grows: 11 },
  { id: "u-4", name: "NebulaGrow", handle: "@nebula", role: "member", status: "gesperrt", grows: 2 },
];

const statusTone = { ok: "leaf", down: "danger", unknown: "warning" } as const;

export default function DevAdmin() {
  const { flags, setFlag, reset } = useFeatures();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [q, setQ] = useState("");
  const [health, setHealth] = useState<HealthResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [diagUrl, setDiagUrl] = useState("/health");
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => setLog(readLog()), []);

  const runHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await checkBackend();
      setHealth(res);
      const down = res.filter((r) => r.status === "down").length;
      setLog(appendLog("Health-Check", down ? `${down} Dienst(e) nicht erreichbar` : "Alle Dienste ok", down ? "danger" : "leaf"));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void runHealth();
  }, [runHealth]);

  const info = useMemo(() => systemInfo(), []);

  const toggle = (key: FeatureKey, core?: boolean) => (v: boolean) => {
    const label = featureMeta.find((m) => m.key === key)?.label ?? key;
    if (core && !v) {
      toast.push({ title: "Kern-Feature", desc: "Dashboard, Auth, Profil und Dev-Admin bleiben an.", tone: "warning", icon: "Lock" });
      return;
    }
    setFlag(key, v);
    setLog(appendLog("Feature-Flag", `${label} → ${v ? "an" : "aus"}`, v ? "leaf" : "warning"));
    toast.push({ title: v ? "Aktiviert" : "Deaktiviert", desc: label, tone: v ? "leaf" : "info", icon: v ? "CheckCircle2" : "Power" });
  };

  const exportFlags = () => {
    const payload = { exportedAt: new Date().toISOString(), mode: info.mode, flags };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "growobserver-flags.json";
    a.click();
    URL.revokeObjectURL(url);
    setLog(appendLog("Export", "Feature-Flags als JSON exportiert", "leaf"));
    toast.push({ title: "Export erstellt", desc: "growobserver-flags.json", tone: "leaf", icon: "Download" });
  };

  const copyOverrides = async () => {
    try {
      await navigator.clipboard.writeText(localStorage.getItem(STORAGE_KEY) ?? "{}");
      toast.push({ title: "In Zwischenablage", desc: "Aktuelle Overrides kopiert.", tone: "info", icon: "Share2" });
    } catch {
      toast.push({ title: "Kopieren fehlgeschlagen", tone: "warning", icon: "AlertTriangle" });
    }
  };

  const runDiag = async () => {
    if (!diagUrl.trim()) return;
    setDiagBusy(true);
    setDiagResult(null);
    const full = diagUrl.startsWith("http") ? diagUrl : `${config.apiBaseUrl || window.location.origin}${diagUrl}`;
    const started = performance.now();
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(full, { signal: ctrl.signal, cache: "no-store" });
      window.clearTimeout(t);
      const ms = Math.round(performance.now() - started);
      const body = await res.text().catch(() => "");
      setDiagResult(`HTTP ${res.status} · ${ms} ms\n\n${body.slice(0, 600) || "(leerer Body)"}`);
      setLog(appendLog("Diagnose", `${diagUrl} → HTTP ${res.status} (${ms} ms)`, res.ok ? "leaf" : "warning"));
    } catch (e) {
      const ms = Math.round(performance.now() - started);
      setDiagResult(`Fehler nach ${ms} ms: ${e instanceof Error ? e.message : "unbekannt"}`);
      setLog(appendLog("Diagnose", `${diagUrl} → Fehler`, "danger"));
    } finally {
      setDiagBusy(false);
    }
  };

  const users = mockUsers.filter((u) => `${u.name} ${u.handle} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
  const onCount = featureMeta.filter((m) => flags[m.key]).length;
  const downCount = health?.filter((h) => h.status === "down").length ?? 0;

  const tabs = [
    { value: "overview" as Tab, label: "Übersicht" },
    { value: "flags" as Tab, label: `Flags (${onCount})` },
    { value: "users" as Tab, label: `User (${mockUsers.length})` },
    { value: "logs" as Tab, label: `Protokoll (${log.length})` },
    { value: "diagnostics" as Tab, label: "Diagnose" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer-Admin"
        subtitle="Betreiber-Konsole für App & Backend: Systemstatus, Feature-Flags, User, Protokoll und Endpoint-Diagnose."
        icon="Cpu"
        actions={
          <>
            <Button variant="secondary" onClick={() => void runHealth()} loading={checking}>
              <Icon name="Zap" size={16} /> Health
            </Button>
            <Button variant="ghost" onClick={exportFlags}>
              <Icon name="Download" size={16} /> Export
            </Button>
          </>
        }
      />

      {/* Status-Banner */}
      <Reveal>
        <Card className={cn("flex flex-wrap items-center gap-3 p-4", downCount > 0 ? "border-danger/30 bg-danger/[0.05]" : "border-leaf-500/25 bg-leaf-500/[0.05]")}>
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", downCount > 0 ? "bg-danger/12 text-danger" : "bg-leaf-500/12 text-leaf-600 dark:text-leaf-400")}>
            <Icon name={downCount > 0 ? "AlertTriangle" : "ShieldCheck"} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{downCount > 0 ? `${downCount} Dienst(e) nicht erreichbar` : "System betriebsbereit"}</div>
            <p className="text-xs text-fg-muted">
              Modus: <span className="font-medium">{info.mode}</span> · Ziel: <code className="text-[11px]">{info.apiBaseUrl}</code> · Online: {info.online}
            </p>
          </div>
          <Badge tone={downCount > 0 ? "danger" : "leaf"}>{downCount > 0 ? "Eingriff nötig" : "ok"}</Badge>
        </Card>
      </Reveal>

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {/* ---------------- Übersicht ---------------- */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(health ?? []).map((h, i) => (
              <Reveal key={h.id} delay={i * 0.04}>
                <Card className="h-full p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{h.label}</span>
                    <Badge tone={statusTone[h.status]}>{h.status === "ok" ? "ok" : h.status === "down" ? "offline" : "unbekannt"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-fg-subtle">{h.hint}</p>
                  {h.latencyMs !== undefined && <p className="mt-1 text-[11px] tnum text-fg-subtle">{h.latencyMs} ms</p>}
                </Card>
              </Reveal>
            ))}
            {!health && checking && [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>

          <Reveal>
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-fg-muted">System & Umgebung</h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {Object.entries(info).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                    <dt className="text-xs capitalize text-fg-subtle">{k}</dt>
                    <dd className="max-w-[60%] truncate text-right text-sm font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-fg-subtle">
                <Icon name="Lock" size={12} className="mr-1 inline align-baseline" />
                Es werden ausschließlich Client-Daten angezeigt — keine Server-Secrets.
              </p>
            </Card>
          </Reveal>
        </div>
      )}

      {/* ---------------- Feature-Flags ---------------- */}
      {tab === "flags" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-muted">Feature-Flags · {onCount}/{featureMeta.length} aktiv</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={copyOverrides}>
                  <Icon name="Share2" size={14} /> Overrides
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    reset();
                    setLog(appendLog("Flags", "Auf Datei-Defaults zurückgesetzt", "leaf"));
                    toast.push({ title: "Flags zurückgesetzt", desc: "Datei-Defaults geladen.", tone: "leaf", icon: "Power" });
                  }}
                >
                  Defaults
                </Button>
              </div>
            </div>
            <div className="divide-y divide-border">
              {featureMeta.map((m) => (
                <div key={m.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.label}</span>
                      {m.core && <Badge>Kern</Badge>}
                      {flags[m.key] !== defaultFeatures[m.key] && <Badge tone="warning">Override</Badge>}
                    </div>
                    <div className="text-xs text-fg-subtle">{m.blurb} · <code className="text-[10px]">{m.key}</code></div>
                  </div>
                  <Toggle checked={flags[m.key]} onChange={toggle(m.key, m.core)} label={m.label} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-fg-subtle">
              Overrides liegen in <code>localStorage["{STORAGE_KEY}"]</code>, Defaults in <code>src/config/features.ts</code>.
              Server-seitige Overrides folgen mit dem Backend.
            </p>
          </Card>
        </Reveal>
      )}

      {/* ---------------- User ---------------- */}
      {tab === "users" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-fg-muted">Benutzer & Rollen</h2>
              <SearchInput placeholder="Name, Handle, Rolle…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
            </div>
            <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-fg-subtle">
                    <th className="pb-2 font-medium">Benutzer</th>
                    <th className="pb-2 font-medium">Rolle</th>
                    <th className="pb-2 font-medium">Grows</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/70">
                      <td className="py-2.5">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-fg-subtle">{u.handle}</div>
                      </td>
                      <td className="py-2.5">
                        <Badge tone={u.role === "platform_admin" ? "leaf" : u.role === "moderator" ? "info" : "soil"}>{u.role}</Badge>
                      </td>
                      <td className="py-2.5 tnum text-fg-muted">{u.grows}</td>
                      <td className={cn("py-2.5 text-xs", u.status === "gesperrt" ? "text-danger" : "text-fg-muted")}>{u.status}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setLog(appendLog("Rolle", `${u.name} → Moderator`, "info"));
                              toast.push({ title: "Rolle geändert (Demo)", desc: `${u.name} → moderator`, tone: "info", icon: "Users" });
                            }}
                          >
                            <Icon name="Users" size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger/10"
                            onClick={() => {
                              setLog(appendLog("Sperre", `${u.name} ${u.status === "gesperrt" ? "entsperrt" : "gesperrt"}`, "warning"));
                              toast.push({ title: u.status === "gesperrt" ? "Entsperrt (Demo)" : "Gesperrt (Demo)", desc: u.name, tone: "warning", icon: "Lock" });
                            }}
                          >
                            <Icon name="Lock" size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-fg-subtle">Demo-Daten. Sobald die API verbunden ist, wird hier <code>/auth/me</code>-Scope &amp; User-Verwaltung live.</p>
          </Card>
        </Reveal>
      )}

      {/* ---------------- Protokoll ---------------- */}
      {tab === "logs" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg-muted">Protokoll (lokal, letzte {MAX_LOG})</h2>
              <Button size="sm" variant="ghost" onClick={() => { setLog([]); localStorage.removeItem(LOG_KEY); }}>
                <Icon name="Trash2" size={14} /> Leeren
              </Button>
            </div>
            {log.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">Noch keine Einträge.</p>
            ) : (
              <ul className="divide-y divide-border">
                {log.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 py-2.5">
                    <Badge tone={l.tone}>{l.action}</Badge>
                    <span className="min-w-0 flex-1 text-sm">{l.detail}</span>
                    <span className="shrink-0 text-[11px] tnum text-fg-subtle">{l.ts}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      )}

      {/* ---------------- Diagnose ---------------- */}
      {tab === "diagnostics" && (
        <Reveal>
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-fg-muted">Endpoint-Diagnose</h2>
              <p className="mt-1 text-xs text-fg-subtle">
                Relativer Pfad wird gegen <code>{config.apiBaseUrl || window.location.origin}</code> aufgelöst.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["/health", "/auth/me", "/grows", "/social/posts", "/forum/threads", "/products"].map((p) => (
                <Chip key={p} active={diagUrl === p} onClick={() => setDiagUrl(p)}>{p}</Chip>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={diagUrl}
                onChange={(e) => setDiagUrl(e.target.value)}
                placeholder="/health"
                className="h-11 flex-1 rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent"
              />
              <Button onClick={() => void runDiag()} loading={diagBusy}>
                <Icon name="Zap" size={16} /> Testen
              </Button>
            </div>
            {diagResult && (
              <pre className="max-h-64 overflow-auto rounded-xl bg-surface-2 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">{diagResult}</pre>
            )}
          </Card>
        </Reveal>
      )}

      <p className="text-xs text-fg-subtle">
        <Icon name="Lock" size={12} className="mr-1 inline align-baseline" />
        Zugang später über Rolle <code>platform_admin</code>. Community-Moderation gehört nicht hierher.
      </p>
    </div>
  );
}
