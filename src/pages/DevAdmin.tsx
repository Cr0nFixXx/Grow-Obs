import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeatures } from "@/config/FeatureContext";
import { defaultFeatures, featureMeta } from "@/config/features";
import { config } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { diagnosticPaths, healthRows, runDiagnostic, systemInfo, type DiagnosticPath } from "@/lib/diagnostics";
import { useServices } from "@/data/DataContext";
import { useResource } from "@/data/useResource";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, EmptyState, Field, Modal, PageHeader, SearchInput, Select, SkeletonCard, Tabs } from "@/components/ui";
import type { AdminRole, AdminUser } from "@/services/interfaces";

type Tab = "overview" | "flags" | "users" | "logs" | "diagnostics";
type LogEntry = { id: string; time: string; action: string };
const tabs: { value: Tab; label: string }[] = [
  { value: "overview", label: "Übersicht" }, { value: "flags", label: "Feature-Flags" },
  { value: "users", label: "Benutzer" }, { value: "logs", label: "Sitzungsprotokoll" },
  { value: "diagnostics", label: "Diagnose" },
];

export default function DevAdmin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [log, setLog] = useState<LogEntry[]>([]);
  const record = useCallback((action: string) => setLog((items) => [
    { id: crypto.randomUUID(), time: new Date().toLocaleTimeString("de-DE"), action }, ...items,
  ].slice(0, 40)), []);

  if (user?.role !== "platform_admin") return <EmptyState icon="Lock" title="Kein Betreiberzugang" desc="Eine bestätigte Plattform-Admin-Sitzung ist erforderlich." />;

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Developer-Admin" icon="Cpu" subtitle="Systemzustand prüfen, Zugriffe verwalten und Funktionen schrittweise freischalten."
        actions={<Badge tone={config.useMock ? "warning" : "info"}>{config.useMock ? "Demo / keine Serverprüfung" : "API-Verbindung"}</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "overview" && <Overview />}
      {tab === "flags" && <Flags record={record} />}
      {tab === "users" && <Users record={record} />}
      {tab === "diagnostics" && <Diagnostics />}
      {tab === "logs" && <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">Sitzungsprotokoll</h2><Button size="sm" variant="ghost" onClick={() => setLog([])}>Leeren</Button></div>
        <p className="mt-2 text-sm text-fg-muted">Nur diese Sitzung, keine Speicherung personenbezogener Aktionen im Browser. Kein revisionssicheres Server-Audit.</p>
        {!log.length ? <p className="py-8 text-center text-sm text-fg-muted">Noch keine Aktionen.</p> : <ul className="mt-4 divide-y divide-border">{log.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-4 py-3 text-sm"><span>{entry.action}</span><time className="shrink-0 text-fg-muted">{entry.time}</time></li>)}</ul>}
      </Card>}
      <p className="text-xs leading-relaxed text-fg-muted">Plattform-Betrieb und Community-Moderation sind getrennt. API-Zugriffe werden zusätzlich auf dem Server geprüft.</p>
    </div>
  );
}

function Overview() {
  const { admin } = useServices();
  const load = useCallback(() => admin.health(), [admin]);
  const query = useResource(load);
  const info = useMemo(() => systemInfo(), []);
  const rows = query.data ? healthRows(query.data) : [];
  const failures = rows.filter((row) => row.status === "down").length;
  const title = query.error ? "Status nicht abrufbar" : !query.data ? "Status wird geprüft" : config.useMock ? "Demo-Betrieb" : failures ? "Ein Dienst benötigt Aufmerksamkeit" : "Basisdienste erreichbar";
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">{title}</h2><p className="mt-1 text-sm text-fg-muted">Liveness, Datenbank und Storage werden getrennt bewertet.</p></div><Button variant="secondary" loading={query.loading} onClick={() => void query.refresh()}><Icon name="Activity" size={16} /> Prüfen</Button></div>
    {query.error && <p role="alert" className="text-sm text-danger">{query.error}. Es wird kein erfolgreicher Check angenommen.</p>}
    {!query.data && query.loading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((id) => <SkeletonCard key={id} />)}</div>}
    {!!rows.length && <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={query.loading}>
      {rows.map((row) => <Card key={row.id} className="min-w-0 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm">{row.label}</h3><Badge tone={row.status === "ok" ? "leaf" : row.status === "down" ? "danger" : "info"}>{row.status === "ok" ? "Erreichbar" : row.status === "down" ? "Fehlgeschlagen" : "Ungeprüft"}</Badge></div><p className="mt-3 text-sm leading-relaxed text-fg-muted">{row.hint}</p>{row.latencyMs !== undefined && <p className="mt-2 text-xs tnum text-fg-subtle">{row.latencyMs} ms</p>}</Card>)}
    </div>}
    <Stats />
    <section><h2 className="mb-3 text-base">Umgebung</h2><dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{Object.entries(info).map(([key, value]) => <div key={key} className="flex min-w-0 items-start justify-between gap-4 border-b border-border py-2 text-sm"><dt className="text-fg-muted">{key}</dt><dd className="min-w-0 max-w-[65%] break-words text-right [overflow-wrap:anywhere]">{value}</dd></div>)}</dl></section>
  </div>;
}

function Stats() {
  const { admin } = useServices();
  const load = useCallback(() => admin.stats(), [admin]);
  const query = useResource(load);
  if (query.error) return <p role="alert" className="text-sm text-danger">Kennzahlen: {query.error}</p>;
  if (!query.data) return <SkeletonCard />;
  const stats = query.data;
  return <section aria-busy={query.loading}><h2 className="mb-3 text-base">{config.useMock ? "Beispiel-Kennzahlen" : "Datenbestand"}</h2><dl className="grid grid-cols-2 gap-4 border-y border-border py-4 sm:grid-cols-3 lg:grid-cols-6">
    {[["Benutzer", stats.users], ["Grows", stats.grows], ["Aktive Grows", stats.activeGrows], ["Posts", stats.posts], ["Threads", stats.threads], ["Kommentare", stats.comments]].map(([label, count]) => <div key={label}><dt className="text-xs text-fg-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tnum">{count}</dd></div>)}
  </dl></section>;
}

function Flags({ record }: { record: (action: string) => void }) {
  const { flags, setFlag, reset } = useFeatures();
  const toast = useToast();
  const exportFlags = () => {
    const blob = new Blob([JSON.stringify({ scope: "local-preview", flags }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "growobserver-flags.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Card className="p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg">Feature-Freigaben</h2><p className="mt-1 max-w-xl text-sm text-fg-muted">Datei-Defaults mit lokaler Vorschau. Diese Schalter ändern keine Serverberechtigungen und noch keine globale Rollout-Konfiguration.</p></div><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={exportFlags}>JSON exportieren</Button><Button variant="secondary" size="sm" onClick={() => { reset(); record("Lokale Flags zurückgesetzt"); }}>Defaults</Button></div></div>
    <ul className="mt-5 divide-y divide-border">{featureMeta.map((feature) => <li key={feature.key} className="flex min-w-0 items-center gap-4 py-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{feature.label}</span>{feature.core && <Badge>Kern</Badge>}{flags[feature.key] !== defaultFeatures[feature.key] && <Badge tone="warning">Lokal geändert</Badge>}</div><p className="mt-1 text-xs text-fg-muted">{feature.blurb}</p></div><button type="button" role="switch" aria-checked={flags[feature.key]} aria-label={feature.label} disabled={feature.core} onClick={() => { setFlag(feature.key, !flags[feature.key]); record(`${feature.label}: lokale Vorschau ${flags[feature.key] ? "aus" : "an"}`); toast.push({ title: "Lokale Vorschau geändert", desc: feature.label, tone: "info" }); }} className="flex min-h-11 min-w-16 shrink-0 items-center justify-end disabled:opacity-50"><span className={`relative h-6 w-11 rounded-full transition-colors ${flags[feature.key] ? "bg-accent" : "bg-surface-3"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${flags[feature.key] ? "left-0.5 translate-x-5" : "left-0.5"}`} /></span></button></li>)}</ul>
  </Card>;
}

function Users({ record }: { record: (action: string) => void }) {
  const { admin } = useServices();
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<AdminRole>("member");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setSearch(q.trim()), 250); return () => clearTimeout(timer); }, [q]);
  const load = useCallback(() => admin.users(search), [admin, search]);
  const query = useResource(load);
  const save = async () => {
    if (!target || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    try {
      await admin.setRole(target.id, role);
      record("Benutzerrolle geändert"); setTarget(null);
      toast.push({ title: "Rolle gespeichert", tone: "leaf" });
      await query.refresh();
    } catch (error) { toast.push({ title: "Rolle nicht geändert", desc: error instanceof Error ? error.message : "Anfrage fehlgeschlagen", tone: "danger" }); }
    finally { setSaving(false); inFlight.current = false; }
  };
  return <section className="min-w-0 space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg">Benutzerverwaltung</h2><SearchInput aria-label="Benutzer suchen" placeholder="Name, Handle, E-Mail" value={q} onChange={(event) => setQ(event.target.value)} className="sm:w-80" /></div>
    {query.error && <p role="alert" className="text-sm text-danger">{query.error}</p>}
    {query.loading && !query.data && <SkeletonCard />}
    {query.data?.length === 0 && <EmptyState icon="Users" title="Keine Treffer" desc="Passe den Suchbegriff an." />}
    <ul className="divide-y divide-border" aria-busy={query.loading}>{query.data?.map((user) => <li key={user.id} className="flex min-w-0 flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1 basis-36"><p className="break-words text-sm font-semibold">{user.name}</p><p className="break-all text-xs text-fg-muted">{user.email}</p></div><Badge tone={user.role === "platform_admin" ? "leaf" : "info"}>{user.role}</Badge><Button variant="secondary" size="sm" disabled={user.id === me?.id} onClick={() => { setTarget(user); setRole(user.role); }}>{user.id === me?.id ? "Dein Konto" : "Rolle ändern"}</Button></li>)}</ul>
    <Modal open={!!target} onClose={() => { if (!saving) setTarget(null); }} title="Rollenänderung bestätigen">
      <p className="mb-4 text-sm text-fg-muted">{target?.name}: Die Änderung wirkt beim nächsten API-Zugriff. Community-Rollen sind davon unabhängig.</p>
      <Field label="Plattformrolle"><Select value={role} disabled={saving} onChange={(event) => setRole(event.target.value as AdminRole)}>{["member", "moderator", "admin", "platform_admin"].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setTarget(null)}>Abbrechen</Button><Button loading={saving} disabled={role === target?.role} onClick={() => void save()}>Bestätigen</Button></div>
    </Modal>
    <p className="text-xs text-fg-muted">Es gibt noch keine echte Kontosperre. Die letzte Plattform-Admin-Rolle kann serverseitig nicht entfernt werden.</p>
  </section>;
}

function Diagnostics() {
  const { admin } = useServices();
  const [path, setPath] = useState<DiagnosticPath>("/admin/health");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const run = async () => {
    if (active.current) return;
    active.current = true; setBusy(true);
    try { setResult(await runDiagnostic(path, admin)); }
    catch (error) { setResult(error instanceof Error ? error.message : "Diagnose fehlgeschlagen"); }
    finally { active.current = false; setBusy(false); }
  };
  return <Card className="space-y-4 p-4 sm:p-5"><div><h2 className="text-lg">Geschützte Diagnose</h2><p className="mt-1 text-sm text-fg-muted">Nur freigegebene GET-Endpunkte. Kein Tokenversand an beliebige URLs, keine Speicherung der Antwort.</p></div><div className="flex flex-wrap gap-2">{diagnosticPaths.map((value) => <Chip key={value} active={path === value} onClick={() => setPath(value)}>{value}</Chip>)}</div><Button loading={busy} onClick={() => void run()}>Prüfen</Button>{result && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-2 p-3 text-xs">{result}</pre>}</Card>;
}