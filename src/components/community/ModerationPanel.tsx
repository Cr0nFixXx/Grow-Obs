import { useMemo } from "react";
import { Avatar, Button, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useCommunityBans } from "@/data/hooks";
import { useServices } from "@/data/DataContext";
import { moderationFor } from "@/lib/moderation-scope";
import { ReportQueue } from "./ReportQueue";

/** Moderation (B-61): Warteschlange der Meldungen (offen/erledigt, seitenweise) und – für Admins – die Sperrliste. */
export function ModerationPanel({ communityId, isAdmin, onChanged }: { communityId: string; isAdmin: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const svc = useServices();
  const scoped = useMemo(() => moderationFor(svc, communityId), [svc, communityId]);
  const { bans, unban } = useCommunityBans(communityId, isAdmin);

  return (
    <div className="space-y-6" data-testid="moderation-panel">
      <ReportQueue scope={communityId} load={scoped.queue} act={scoped.resolve} onChanged={onChanged} />

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
