import { useState } from "react";
import { Badge, Button, Card, EmptyState, Segmented, SkeletonCard } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useReportQueue } from "@/data/hooks";
import type { ReportAction, ReportGroup, ReportKind, ReportPage } from "@/types";
import { kindLabel, reasonLabel } from "./moderation-labels";

/**
 * Warteschlange der Meldungen (offen/erledigt), seitenweise mit „Mehr laden“ (B-89).
 * Gemeinsam für Communities und die Plattform: `load`/`act` bestimmen die Quelle, `scope` setzt die Liste beim Wechsel zurück.
 */
export function ReportQueue({ scope, load, act, onChanged }: {
  scope: string;
  load: (status: "open" | "closed", offset: number) => Promise<ReportPage>;
  act: (kind: ReportKind, targetId: string, action: ReportAction) => Promise<void>;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const { groups, hasMore, loading, loadingMore, error, loadMore, resolve } = useReportQueue(scope, status, load, act);
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (g: ReportGroup, action: ReportAction) => {
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
    <div className="space-y-4" data-testid="report-queue">
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
                      <Badge tone="info">{g.kind === "forum_comment" ? "Forum-Kommentar" : kindLabel(g.kind)}</Badge>
                      <Badge tone="warning">{g.count} {g.count === 1 ? "Meldung" : "Meldungen"}</Badge>
                      {g.status === "hidden" && <Badge tone="danger">Ausgeblendet</Badge>}
                      {g.status === "dismissed" && <Badge tone="leaf">Kein Verstoß</Badge>}
                      {g.status !== "open" && g.resolvedBy && <span className="text-xs text-fg-subtle">von {g.resolvedBy}{g.resolvedAgo ? ` · ${g.resolvedAgo}` : ""}</span>}
                    </div>
                    {g.preview ? (
                      <blockquote className="rounded-xl bg-surface-2 p-3 text-sm">
                        <div className="mb-1 text-xs text-fg-subtle">{g.preview.author}{g.preview.handle ? ` · ${g.preview.handle}` : ""}{g.preview.hidden ? " · bereits ausgeblendet" : ""}</div>
                        {g.preview.title && <p className="mb-1 font-semibold">{g.preview.title}</p>}
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
                        {g.preview && !g.preview.hidden && <Button variant="danger" size="sm" loading={busy === key} onClick={() => void decide(g, "hide")}>Ausblenden &amp; erledigen</Button>}
                        <Button variant="secondary" size="sm" loading={busy === key} onClick={() => void decide(g, "dismiss")}>{g.preview ? "Kein Verstoß" : "Erledigen"}</Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      {hasMore && <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()} data-testid="queue-more">Mehr laden</Button></div>}
    </div>
  );
}
