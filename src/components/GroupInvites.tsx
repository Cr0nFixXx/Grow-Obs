import { useState } from "react";
import { Avatar, Button } from "@/components/ui";
import { expiryLabel } from "@/lib/chat-groups";
import type { MyGroupInvite } from "@/services/interfaces";

/** Meine offenen Gruppeneinladungen (B-65) über der Konversationsliste: annehmen oder ablehnen. */
export function InviteBanner({ invites, onAccept, onDecline }: { invites: MyGroupInvite[]; onAccept: (id: string) => Promise<void>; onDecline: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (invites.length === 0) return null;
  const run = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id); setError(null);
    try { await fn(id); } catch (e) { setError(e instanceof Error ? e.message : "Das hat nicht geklappt"); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2 border-b border-border bg-accent/5 p-3" data-testid="invite-banner" role="region" aria-label="Einladungen">
      <div className="text-xs font-semibold text-fg-muted">{invites.length === 1 ? "1 Einladung" : `${invites.length} Einladungen`}</div>
      {invites.map((i) => (
        <div key={i.id} className="rounded-xl border border-border bg-surface p-2.5" data-testid="invite-card">
          <div className="flex items-center gap-2.5">
            <Avatar src={i.groupAvatar} name={i.groupName} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{i.groupName}</div>
              <div className="truncate text-xs text-fg-muted">{i.inviterName} lädt dich ein · {i.memberCount} {i.memberCount === 1 ? "Mitglied" : "Mitglieder"} · {expiryLabel(i.expiresAt)}</div>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void run(i.id, onAccept)}>Annehmen</Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run(i.id, onDecline)}>Ablehnen</Button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
