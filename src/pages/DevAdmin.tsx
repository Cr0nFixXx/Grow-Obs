import { useState } from "react";
import { useFeatures } from "@/config/FeatureContext";
import { defaultFeatures, featureMeta, type FeatureKey } from "@/config/features";
import { config } from "@/lib/config";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, PageHeader, SearchInput, Toggle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Reveal } from "@/components/motion";
import { currentUser } from "@/mocks/data";
import { cn } from "@/utils/cn";

const health = [
  { id: "api", label: "API", ok: config.useMock, hint: config.useMock ? "Mock-Modus (kein Server)" : "VITE_API_URL gesetzt" },
  { id: "db", label: "Datenbank", ok: false, hint: "Noch nicht angebunden" },
  { id: "storage", label: "Object Storage", ok: false, hint: "MinIO / S3 ausstehend" },
  { id: "ai", label: "KI-Provider", ok: false, hint: "Key nur serverseitig — Flag steuert UI" },
];

const mockUsers = [
  { id: "u-me", name: currentUser.name, handle: currentUser.handle, role: "platform_admin", status: "aktiv" },
  { id: "u-2", name: "Lena B.", handle: "@lena_grows", role: "member", status: "aktiv" },
  { id: "u-3", name: "soilWizard", handle: "@soilwizard", role: "moderator", status: "aktiv" },
  { id: "u-4", name: "NebulaGrow", handle: "@nebula", role: "member", status: "gesperrt" },
];

export default function DevAdmin() {
  const { flags, setFlag, reset, isEnabled } = useFeatures();
  const toast = useToast();
  const [q, setQ] = useState("");
  const users = mockUsers.filter((u) => `${u.name} ${u.handle} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
  const onCount = featureMeta.filter((m) => flags[m.key]).length;

  const toggle = (key: FeatureKey, core?: boolean) => (v: boolean) => {
    if (core && !v) {
      toast.push({ title: "Kern-Feature", desc: "Dashboard, Auth, Profil und Dev-Admin bleiben an.", tone: "warning", icon: "Lock" });
      return;
    }
    setFlag(key, v);
    toast.push({ title: v ? "Aktiviert" : "Deaktiviert", desc: featureMeta.find((m) => m.key === key)?.label, tone: v ? "leaf" : "info", icon: v ? "CheckCircle2" : "Power" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer-Admin"
        subtitle="Betreiber-Konsole: Feature-Flags, Systemstatus, User. Overrides liegen lokal (go-features), Defaults in features.ts."
        icon="Cpu"
        actions={<Button variant="secondary" onClick={() => { reset(); toast.push({ title: "Flags zurückgesetzt", desc: "Datei-Defaults geladen.", tone: "leaf", icon: "Power" }); }}>Defaults</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {health.map((h, i) => (
          <Reveal key={h.id} delay={i * 0.04}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{h.label}</span>
                <Badge tone={h.ok ? "leaf" : "warning"}>{h.ok ? "ok" : "offen"}</Badge>
              </div>
              <p className="mt-2 text-xs text-fg-subtle">{h.hint}</p>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg-muted">Feature-Flags · {onCount}/{featureMeta.length} an</h2>
            <Badge tone={config.useMock ? "info" : "leaf"}>{config.useMock ? "Mock" : "API"}</Badge>
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
                <Toggle checked={isEnabled(m.key)} onChange={toggle(m.key, m.core)} label={m.label} />
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <Card className="p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-fg-muted">User (Mock)</h2>
            <SearchInput placeholder="Name, Handle, Rolle…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-fg-subtle">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Rolle</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/70">
                    <td className="py-2.5">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-fg-subtle">{u.handle}</div>
                    </td>
                    <td className="py-2.5"><Badge tone={u.role === "platform_admin" ? "leaf" : "info"}>{u.role}</Badge></td>
                    <td className={cn("py-2.5 text-xs", u.status === "gesperrt" ? "text-danger" : "text-fg-muted")}>{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      <p className="text-xs text-fg-subtle">
        <span className="relative top-[0.14em] mr-1.5 inline-block shrink-0 align-baseline leading-none"><Icon name="Lock" size={12} /></span>
        Zugang später über Rolle <code>platform_admin</code>. Community-Mods gehören nicht hierher.
      </p>
    </div>
  );
}
