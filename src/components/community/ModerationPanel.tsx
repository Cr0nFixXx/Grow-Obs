import { useState } from "react";
import { Avatar, Badge, Button, Card, EmptyState, Segmented, SkeletonCard } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useModeration } from "@/data/hooks";
import type { ReportGroup } from "@/types";
import { reasonLabel } from "./moderation-labels";

/** Moderation (B-61): Warteschlange der Meldungen (offen/erledigt) und – für Admins – die Sperrliste. */
export function ModerationPanel({ communityId, isAdmin, onChanged }: { communityId: string; isAdmin: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const { groups, loading, error, resolve, bans, unban } = useModeration(communityId, status, isAdmin);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (g: ReportGroup, action: "hide" | "dismiss") => {
    const key = `${g.kind}:${g.targetId}`;
    setBusy(key);
    try {
      await resolve(g.kind, g.targetId, action);
      onChanged?.();
      toast.push({ title: action === "hide" ? "Ausgeblendet" : "Als „kein Verstoß“ erledigt", tone: "leaf", icon: "ShieldCheck" });
    } catch (e) {
      toast.push({ title: "Aktion fehlgeschlagen", desc: e instanceof Error ? e.message : "", tone: "danger", icon: "AlertTriangle" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6" data-testid="moderation-panel">
      <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "Offen" }, { value: "closed", label: "Erledigt" }]} />
      {loading && groups.length === 0 ? <SkeletonCard />
        : error && groups.length === 0 ? <EmptyState icon="AlertTriangle" title="Meldungen nicht geladen" desc={error} />
        : groups.length === 0 ? <EmptyState icon="ShieldCheck" title={status === "open" ? "Keine offenen Meldungen" : "Noch nichts erledigt"} desc={status === "open" ? "Alles ruhig – neue Meldungen erscheinen hier." : "Entschiedene Meldungen siehst du hier."} />
        : (
          <ul className="space-y-3" aria-label="Meldungen">
            {groups.map((g) => {
              const key = `${g.kind}:${g.targetId}`;
              return (
                <li key={`${key}:${g.status}`}>
                  <Card className="space-y-3 p-4" data-testid="report-group">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{g.kind === "post" ? "Beitrag" : "Kommentar"}</Badge>
                      <Badge tone="warning">{g.count} {g.count === 1 ? "Meldung" : "Meldungen"}</Badge>
                      {g.status === "hidden" && <Badge tone="danger">Ausgeblendet</Badge>}
                      {g.status === "dismissed" && <Badge tone="leaf">Kein Verstoß</Badge>}
                      {g.status !== "open" && g.resolvedBy && <span className="text-xs text-fg-subtle">von {g.resolvedBy}{g.resolvedAgo ? ` · ${g.resolvedAgo}` : ""}</span>}
                    </div>
                    {g.preview ? (
                      <blockquote className="rounded-xl bg-surface-2 p-3 text-sm">
                        <div className="mb-1 text-xs text-fg-subtle">{g.preview.author}{g.preview.handle ? ` · ${g.preview.handle}` : ""}{g.preview.hidden ? " · bereits ausgeblendet" : ""}</div>
                        <p className="whitespace-pre-line break-words">{g.preview.text}</p>
                      </blockquote>
                    ) : <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">Der Inhalt wurde inzwischen gelöscht.</p>}
                    <ul className="space-y-1 text-xs text-fg-muted">
                      {g.reports.map((r) => (
                        <li key={r.id}><span className="font-medium text-fg">{r.reporter}</span> · {reasonLabel(r.reason)}{r.details ? ` – „${r.details}“` : ""} <span className="text-fg-subtle">({r.ago})</span></li>
                      ))}
                    </ul>
                    {g.status === "open" && (
                      <div className="flex flex-wrap gap-2">
                        {g.preview && !g.preview.hidden && <Button variant="danger" size="sm" loading={busy === key} onClick={() => void act(g, "hide")}>Ausblenden &amp; erledigen</Button>}
                        <Button variant="secondary" size="sm" loading={busy === key} onClick={() => void act(g, "dismiss")}>{g.preview ? "Kein Verstoß" : "Erledigen"}</Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

      {isAdmin && (
        <Card className="p-5" data-testid="ban-list">
          <h2 className="mb-1 text-sm font-semibold text-fg-muted">Gesperrt ({bans.length})</h2>
          <p className="mb-3 text-xs text-fg-subtle">Gesperrte Personen können nicht beitreten – auch nicht per Code. Entsperren erlaubt den Beitritt wieder.</p>
          {bans.length === 0 ? <p className="text-sm text-fg-muted">Niemand gesperrt.</p> : (
            <ul className="divide-y divide-border">
              {bans.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-3">
                  <Avatar src={b.avatar} name={b.name} size={36} />
                  <div className="min-w-0 flex-1"><div className="font-medium">{b.name}</div><div className="text-xs text-fg-subtle">{b.handle}</div></div>
                  <Button size="sm" variant="secondary" onClick={() => void unban(b.id).then(() => toast.push({ title: "Entsperrt", desc: b.name, tone: "leaf", icon: "ShieldCheck" }))}>Entsperren</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
