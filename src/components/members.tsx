import { StatusLine } from "@/components/status";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Badge, Button, Card, Modal } from "@/components/ui";
import { resolveMedia } from "@/lib/media";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useNav } from "@/lib/nav";
import { useServices } from "@/data/DataContext";
import type { FollowRequest, FollowState, MemberPerson } from "@/services/interfaces";

/** Anzeige-Handle: im Betrieb ohne „@“, im Demo-Modus mit – immer genau ein „@“. */
export const atHandle = (handle: string) => `@${handle.replace(/^@/, "")}`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : "Bitte noch einmal versuchen.");

/** Folgen / Anfrage senden / Anfrage zurückziehen / Entfolgen – je nach Stand. */
export function FollowButton({ handle, state, needsApproval, onChange }: { handle: string; state: FollowState; needsApproval: boolean; onChange: (next: FollowState) => void }) {
  const { members } = useServices();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (state === "none") onChange(await members.follow(handle));
      else { await members.unfollow(handle); onChange("none"); }
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: errorText(error), tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  if (state === "accepted") return <Button variant="secondary" onClick={run} loading={busy}><Icon name="UserCheck" size={16} /> Gefolgt</Button>;
  if (state === "pending") return <Button variant="secondary" onClick={run} loading={busy}><Icon name="Clock" size={16} /> Angefragt</Button>;
  return <Button onClick={run} loading={busy}><Icon name="UserPlus" size={16} /> {needsApproval ? "Anfrage senden" : "Folgen"}</Button>;
}

/** Titelbild-Kopf eines Profils: Bild, sonst der Farbverlauf. Ein fehlerhaftes Bild fällt auf den Verlauf zurück. */
export function ProfileBanner({ src, className = "h-28" }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-leaf-600/70 to-leaf-950 ${className}`}>
      {src && !failed && <img src={resolveMedia(src)} alt="" className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} draggable={false} />}
    </div>
  );
}

function PersonRow({ person, onOpen, action }: { person: MemberPerson; onOpen: () => void; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Profil von ${person.name} öffnen`}>
        <Avatar src={person.avatar} name={person.name} size={40} />
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{person.name}</span><span className="block truncate text-xs text-fg-subtle">{atHandle(person.handle)}</span><StatusLine status={person.status} className="text-xs" /></span>
      </button>
      {action}
    </li>
  );
}

/** Liste der Follower bzw. der gefolgten Mitglieder. Bei den eigenen Followern lassen sich einzelne entfernen. */
export function FollowListModal({ open, onClose, handle, kind, mine }: { open: boolean; onClose: () => void; handle: string; kind: "followers" | "following"; mine?: boolean }) {
  const { members } = useServices();
  const { navigate } = useNav();
  const toast = useToast();
  const [people, setPeople] = useState<MemberPerson[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPeople(null); setError("");
    (kind === "followers" ? members.followers(handle) : members.following(handle)).then((list) => { if (alive) setPeople(list); }).catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [open, handle, kind, members]);
  const remove = async (person: MemberPerson) => {
    try {
      await members.removeFollower(person.id);
      setPeople((current) => current?.filter((p) => p.id !== person.id) ?? current);
    } catch (e) {
      toast.push({ title: "Nicht entfernt", desc: errorText(e), tone: "danger", icon: "AlertTriangle" });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={kind === "followers" ? "Follower" : "Folgt"}>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p>
        : people === null ? <p role="status" className="py-6 text-center text-sm text-fg-subtle">Lade …</p>
        : people.length === 0 ? <p className="py-6 text-center text-sm text-fg-subtle">{kind === "followers" ? "Noch keine Follower." : "Folgt noch niemandem."}</p>
        : (
          <ul className="max-h-[60dvh] space-y-1 overflow-y-auto">
            {people.map((p) => (
              <PersonRow key={p.id} person={p} onOpen={() => { onClose(); navigate("member", { handle: p.handle.replace(/^@/, "") }); }}
                action={mine && kind === "followers" ? <Button size="sm" variant="ghost" onClick={() => void remove(p)}>Entfernen</Button> : undefined} />
            ))}
          </ul>
        )}
    </Modal>
  );
}

/** Offene Follower-Anfragen an mich (nur sichtbar, wenn welche da sind). */
export function FollowRequestsCard({ onChanged }: { onChanged?: () => void }) {
  const { members } = useServices();
  const { navigate } = useNav();
  const toast = useToast();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { members.requests().then(setRequests).catch(() => undefined); }, [members]);
  useEffect(() => { load(); }, [load]);
  const decide = async (person: FollowRequest, accept: boolean) => {
    setBusy(person.id);
    try {
      if (accept) await members.accept(person.id); else await members.decline(person.id);
      setRequests((current) => current.filter((r) => r.id !== person.id));
      onChanged?.();
    } catch (e) {
      toast.push({ title: "Nicht gespeichert", desc: errorText(e), tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(null);
    }
  };
  if (requests.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-muted">Follower-Anfragen <Badge tone="warning">{requests.length}</Badge></h2>
      <ul className="space-y-1">
        {requests.map((r) => (
          <PersonRow key={r.id} person={r} onOpen={() => navigate("member", { handle: r.handle.replace(/^@/, "") })}
            action={<div className="flex gap-1.5"><Button size="sm" onClick={() => void decide(r, true)} loading={busy === r.id}>Annehmen</Button><Button size="sm" variant="ghost" onClick={() => void decide(r, false)} disabled={busy === r.id}>Ablehnen</Button></div>} />
        ))}
      </ul>
    </Card>
  );
}
