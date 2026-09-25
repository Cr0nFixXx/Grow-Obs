import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeatures } from "@/config/FeatureContext";
import { type FeatureKey, defaultFeatures, featureMeta } from "@/config/features";
import { config } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { diagnosticPaths, healthRows, runDiagnostic, systemInfo, type DiagnosticPath } from "@/lib/diagnostics";
import { useServices } from "@/data/DataContext";
import { useResource } from "@/data/useResource";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { useSwipeTabs } from "@/lib/gestures";
import { useAppUpdate } from "@/lib/update";
import { ReleaseItem } from "@/components/UpdateUI";
import { APP_VERSION, versionLabel } from "@/lib/app-version";
import type { Release } from "@/lib/update-logic";
import { Badge, Button, Card, Chip, EmptyState, Field, Modal, PageHeader, SearchInput, Select, SkeletonCard, Tabs, Input, Textarea, Segmented } from "@/components/ui";
import type { AdminRole, AdminUser } from "@/services/interfaces";

type Tab = "overview" | "flags" | "updates" | "users" | "logs" | "diagnostics";
type LogEntry = { id: string; time: string; action: string };
const tabs: { value: Tab; label: string }[] = [
  { value: "overview", label: "Übersicht" }, { value: "flags", label: "Feature-Flags" }, { value: "updates", label: "Updates" },
  { value: "users", label: "Benutzer" }, { value: "logs", label: "Sitzungsprotokoll" },
  { value: "diagnostics", label: "Diagnose" },
];

/** Reihenfolge für Tab-Wischen (links/rechts über den Inhalt). */
const tabKeys = tabs.map((t) => t.value);

export default function DevAdmin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipeTabs(swipeRef, tabKeys, tab, setTab);
  const [log, setLog] = useState<LogEntry[]>([]);
  const record = useCallback((action: string) => setLog((items) => [
    { id: crypto.randomUUID(), time: new Date().toLocaleTimeString("de-DE"), action }, ...items,
  ].slice(0, 40)), []);

  if (user?.role !== "platform_admin") return <EmptyState icon="Lock" title="Kein Betreiberzugang" desc="Eine bestätigte Plattform-Admin-Sitzung ist erforderlich." />;

  return (
    <div ref={swipeRef} className="min-w-0 space-y-6">
      <PageHeader title="Developer-Admin" icon="Cpu" subtitle="Systemzustand prüfen, Zugriffe verwalten und Funktionen schrittweise freischalten."
        actions={<Badge tone={config.useMock ? "warning" : "info"}>{config.useMock ? "Demo / keine Serverprüfung" : "API-Verbindung"}</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "overview" && <Overview />}
      {tab === "flags" && <Flags record={record} />}
      {tab === "updates" && <Updates record={record} />}
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
  const { flags, setFlag, reset, global } = useFeatures();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const scope = global ? "Global (alle Nutzer)" : "Nur dieser Browser (Demo)";
  const toggle = async (key: FeatureKey, label: string) => {
    const next = !flags[key];
    setPending(key);
    try {
      await setFlag(key, next);
      record(`${label}: ${next ? "an" : "aus"} · ${scope}`);
      toast.push({ title: `${label} ${next ? "aktiviert" : "deaktiviert"}`, desc: global ? "Gilt sofort serverseitig; Apps übernehmen es beim nächsten Öffnen bzw. innerhalb 1 Min." : "Demo-Modus: nur in diesem Browser.", tone: next ? "leaf" : "warning", icon: "SlidersHorizontal" });
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setPending(null);
    }
  };
  const exportFlags = () => {
    const blob = new Blob([JSON.stringify({ scope: global ? "global" : "local-preview", flags }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "growobserver-flags.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Card className="p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-lg">Feature-Freigaben <Badge tone={global ? "leaf" : "warning"}>{scope}</Badge></h2>
        <p className="mt-1 max-w-xl text-sm text-fg-muted">{global
          ? "Schalter gelten für alle Nutzer und Geräte (auch installierte Apps). Die API sperrt deaktivierte Bereiche zusätzlich serverseitig."
          : "Demo-Modus ohne Server: Änderungen wirken nur in diesem Browser."}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={exportFlags}>JSON exportieren</Button>
        <Button variant="secondary" size="sm" onClick={() => { void reset().then(() => { record(`Flags auf Defaults zurückgesetzt · ${scope}`); toast.push({ title: "Defaults wiederhergestellt", tone: "info", icon: "SlidersHorizontal" }); }).catch((error: unknown) => toast.push({ title: "Zurücksetzen fehlgeschlagen", desc: error instanceof Error ? error.message : "", tone: "danger", icon: "AlertTriangle" })); }}>Defaults</Button>
      </div>
    </div>
    <ul className="mt-5 divide-y divide-border">{featureMeta.map((feature) => <li key={feature.key} className="flex min-w-0 items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{feature.label}</span>{feature.core && <Badge>Kern</Badge>}{flags[feature.key] !== defaultFeatures[feature.key] && <Badge tone="warning">{global ? "Global geändert" : "Lokal geändert"}</Badge>}</div>
        <p className="mt-1 text-xs text-fg-muted">{feature.blurb}</p>
      </div>
      <button type="button" role="switch" aria-checked={flags[feature.key]} aria-label={feature.label} aria-busy={pending === feature.key} disabled={feature.core || pending !== null} onClick={() => void toggle(feature.key, feature.label)} className="flex min-h-11 min-w-16 shrink-0 items-center justify-end disabled:opacity-50">
        <span className={`relative h-6 w-11 rounded-full transition-colors ${flags[feature.key] ? "bg-accent" : "bg-surface-3"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${flags[feature.key] ? "left-0.5 translate-x-5" : "left-0.5"}`} /></span>
      </button>
    </li>)}</ul>
  </Card>;
}

/** Release-Notes veröffentlichen; optional Features gleichzeitig freischalten; Pflicht-Update erzwingen. */
function Updates({ record }: { record: (action: string) => void }) {
  const { releases: releaseService } = useServices();
  const { setFlag, flags, global } = useFeatures();
  const update = useAppUpdate();
  const toast = useToast();
  const [version, setVersion] = useState(APP_VERSION);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState<Release["severity"]>("recommended");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const noteList = notes.split("\n").map((n) => n.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const valid = version.trim() && title.trim().length >= 3 && noteList.length > 0;
  const switchable = featureMeta.filter((f) => !f.core);

  const publish = async () => {
    if (!valid || busy) return;
    if (severity === "required" && !window.confirm("Pflicht-Update: Alle Nutzer mit älterer Version müssen sofort aktualisieren. Fortfahren?")) return;
    setBusy(true);
    try {
      if (activate) for (const key of features) if (!flags[key]) await setFlag(key, true);
      const r = await releaseService.create({ version: version.trim(), title: title.trim(), notes: noteList, severity, features });
      record(`Release v${r.version} veröffentlicht (${severity}${features.length ? `, Features: ${features.join(", ")}` : ""})`);
      toast.push({ title: "Veröffentlicht", desc: `v${r.version} · ${r.title}`, tone: "leaf", icon: "Rocket" });
      setTitle(""); setNotes(""); setFeatures([]); setSeverity("recommended");
      await update.check();
    } catch (error) {
      toast.push({ title: "Nicht veröffentlicht", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r: Release) => {
    if (!window.confirm(`Release v${r.version} „${r.title}“ löschen?`)) return;
    try {
      await releaseService.remove(r.id);
      record(`Release v${r.version} gelöscht`);
      await update.check();
    } catch (error) {
      toast.push({ title: "Löschen fehlgeschlagen", desc: error instanceof Error ? error.message : "", tone: "danger", icon: "AlertTriangle" });
    }
  };

  return <div className="grid min-w-0 gap-6 lg:grid-cols-[1.1fr_1fr]">
    <Card className="space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-lg">Neuigkeit / Update veröffentlichen</h2>
        <p className="mt-1 text-sm text-fg-muted">Erscheint bei allen Nutzern als „Was ist neu“. Neue Code-Versionen erkennt die App selbst (Build-Vergleich); hier steuerst du Hinweise und Dringlichkeit.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Version"><Input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={30} /></Field>
        <Field label="Titel"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Neues Forum mit Votes" maxLength={120} /></Field>
      </div>
      <Field label="Änderungen" hint="eine pro Zeile"><Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"Votes im Forum\nAntworten auf Kommentare"} /></Field>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Dringlichkeit</span>
        <Segmented value={severity} onChange={setSeverity} options={[{ value: "optional", label: "Optional" }, { value: "recommended", label: "Empfohlen" }, { value: "required", label: "Pflicht" }]} />
        <p className="text-xs text-fg-subtle">{severity === "required" ? "Blockiert Apps mit älterem Build, bis sie aktualisiert sind." : severity === "recommended" ? "Hinweis/Banner je nach Nutzer-Einstellung." : "Nur in „Was ist neu“, kein aktiver Hinweis."}</p>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Neue Features hervorheben</span>
        <div className="flex flex-wrap gap-1.5">
          {switchable.map((f) => (
            <Chip key={f.key} active={features.includes(f.key)} onClick={() => setFeatures((cur) => (cur.includes(f.key) ? cur.filter((k) => k !== f.key) : [...cur, f.key]))}>
              {f.label}{!flags[f.key] && " · aus"}
            </Chip>
          ))}
        </div>
        {features.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Ausgewählte Features beim Veröffentlichen {global ? "für alle" : "lokal"} aktivieren
          </label>
        )}
      </div>
      <Button className="w-full" onClick={() => void publish()} loading={busy} disabled={!valid}><Icon name="Rocket" size={16} /> Veröffentlichen</Button>
    </Card>

    <Card className="min-w-0 space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg">Veröffentlicht</h2>
        <Button size="sm" variant="ghost" onClick={() => void update.check()} loading={update.status === "checking"}>Neu laden</Button>
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-xs text-fg-muted">
        Dieser Client: <span className="font-medium text-fg">{versionLabel()}</span> · Server: <span className="font-medium text-fg">{update.serverVersion ? `v${update.serverVersion}` : "—"}</span>{update.available && <Badge tone="warning" className="ml-2">Update verfügbar</Badge>}
      </div>
      {update.releases.length === 0 ? <p className="py-6 text-center text-sm text-fg-muted">Noch nichts veröffentlicht.</p> : update.releases.map((r) => (
        <div key={r.id} className="relative">
          <ReleaseItem r={r} />
          <button onClick={() => void remove(r)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-danger/10 hover:text-danger" aria-label={`Release v${r.version} löschen`}><Icon name="Trash2" size={16} /></button>
        </div>
      ))}
    </Card>
  </div>;
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