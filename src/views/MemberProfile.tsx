import { useCallback, useEffect, useState } from "react";
import { Avatar, Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { atHandle, FollowButton, FollowListModal } from "@/components/members";
import { useNav } from "@/lib/nav";
import { useServices } from "@/data/DataContext";
import type { FollowState, MemberProfile as Member } from "@/services/interfaces";

/** Profil eines anderen Mitglieds (`/u/<handle>`, B-73). Einschränkungen der Sichtbarkeit setzt der Server durch. */
export default function MemberProfile() {
  const { params, navigate } = useNav();
  const { members } = useServices();
  const handle = params?.handle ?? "";
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState("");
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const load = useCallback(() => {
    if (!handle) return;
    setMember(null); setError("");
    members.get(handle).then(setMember).catch((e: unknown) => setError(e instanceof Error ? e.message : "Profil konnte nicht geladen werden."));
  }, [handle, members]);
  useEffect(() => { load(); }, [load]);

  if (!handle) return <EmptyState icon="User" title="Kein Mitglied angegeben" action={<Button onClick={() => navigate("dashboard")}>Zum Dashboard</Button>} />;
  if (error) return <EmptyState icon="User" title="Profil nicht verfügbar" desc={error} action={<div className="flex gap-2"><Button variant="secondary" onClick={load}>Erneut versuchen</Button><Button variant="soft" onClick={() => navigate("dashboard")}>Zum Dashboard</Button></div>} />;
  if (!member) return <div className="space-y-4" role="status" aria-label="Profil wird geladen"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>;

  const setRelation = (following: FollowState) => setMember((current) => (current ? { ...current, relation: { ...current.relation, following }, stats: current.stats ? { ...current.stats, followers: Math.max(0, current.stats.followers + (following === "accepted" ? 1 : current.relation.following === "accepted" ? -1 : 0)) } : current.stats } : current));
  const stats = member.stats;
  const facts = [
    member.location ? { icon: "MapPin", text: member.location } : null,
    member.growSince ? { icon: "CalendarDays", text: `Baut an seit ${member.growSince}` } : null,
    member.medium ? { icon: "Sprout", text: member.medium } : null,
  ].filter((f): f is { icon: string; text: string } => !!f);

  return (
    <div className="space-y-6">
      <PageHeader title={member.name} subtitle={`${atHandle(member.handle)} · ${member.title}`} icon="User" />
      <Reveal>
        <Card className="overflow-hidden p-0">
          <div className="h-24 bg-gradient-to-br from-leaf-600/70 to-leaf-950" />
          <div className="px-5 pb-5">
            <div className="-mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Avatar src={member.avatar} name={member.name} size={84} className="ring-4 ring-surface" />
              {member.isMe
                ? <Button variant="secondary" onClick={() => navigate("profile")}><Icon name="Pencil" size={16} /> Mein Profil bearbeiten</Button>
                : member.canFollow
                  ? <FollowButton handle={member.handle} state={member.relation.following} needsApproval={member.visibility === "followers"} onChange={(next) => { setRelation(next); members.get(handle).then(setMember).catch(() => undefined); }} />
                  : null}
            </div>
            {!member.isMe && member.relation.followedBy && <div className="mt-3"><Badge tone="leaf">Folgt dir</Badge></div>}

            {member.restricted ? (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-sm text-fg-muted" role="note">
                <Icon name="Lock" size={18} className="mt-0.5 shrink-0" />
                <p>{member.visibility === "followers"
                  ? (member.relation.following === "pending" ? "Deine Anfrage wartet auf Bestätigung. Danach siehst du das Profil." : "Dieses Profil ist nur für Follower sichtbar. Sende eine Anfrage, um es zu sehen.")
                  : "Dieses Profil ist privat."}</p>
              </div>
            ) : (
              <>
                {member.bio && <p className="mt-4 whitespace-pre-line text-sm">{member.bio}</p>}
                {facts.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">{facts.map((f) => <li key={f.text} className="flex items-center gap-1.5"><Icon name={f.icon} size={14} />{f.text}</li>)}</ul>}
                {member.interests && member.interests.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{member.interests.map((i) => <Badge key={i} tone="leaf">{i}</Badge>)}</div>}
                {stats && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{stats.grows.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Grows</div></div>
                    <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{stats.harvests.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Ernten</div></div>
                    <button type="button" onClick={() => setList("followers")} className="rounded-xl bg-surface-2 p-3 text-center transition hover:bg-surface-3"><div className="text-lg font-bold tnum">{stats.followers.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Follower</div></button>
                    <button type="button" onClick={() => setList("following")} className="rounded-xl bg-surface-2 p-3 text-center transition hover:bg-surface-3"><div className="text-lg font-bold tnum">{stats.following.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Folgt</div></button>
                  </div>
                )}
                {member.memberSince && <p className="mt-3 text-xs text-fg-subtle">Mitglied seit {new Date(member.memberSince).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</p>}
              </>
            )}
          </div>
        </Card>
      </Reveal>
      {list && <FollowListModal open onClose={() => setList(null)} handle={member.handle} kind={list} mine={member.isMe} />}
    </div>
  );
}
