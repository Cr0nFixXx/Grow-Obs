import { useState } from "react";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { useCommunities, useCommunity } from "@/data/hooks";
import { useCurrentUser } from "@/lib/auth";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { ModerationPanel } from "@/components/community/ModerationPanel";
import { Icon } from "@/components/Icon";
import {
  Avatar, Badge, BottomSheet, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader,
  SearchInput, Select, SkeletonCard, Tabs, Textarea, Toggle,
} from "@/components/ui";
import { Reveal } from "@/components/motion";

export default function Communities() {
  const { params } = useNav();
  return params?.id ? <CommunityDetail id={params.id} /> : <CommunityList />;
}

function CommunityList() {
  const { navigate } = useNav();
  const toast = useToast();
  const { communities, loading, error, create, joinPublic, joinByCode } = useCommunities();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Communities nicht geladen" desc={error} />;

  const list = communities.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase()));
  const createNow = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await create({ name: name.trim(), description: description.trim(), isPrivate });
      setCreateOpen(false); setName(""); setDescription("");
      toast.push({ title: "Community erstellt", desc: c.name, tone: "leaf", icon: "Users" });
      navigate("communities", { id: c.id });
    } catch (e) { toast.push({ title: "Fehler", desc: e instanceof Error ? e.message : "Erstellen fehlgeschlagen", tone: "danger", icon: "AlertTriangle" }); }
    finally { setBusy(false); }
  };
  const joinCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const c = await joinByCode(code.trim()); setJoinOpen(false); setCode("");
      toast.push({ title: "Beigetreten", desc: c.name, tone: "leaf", icon: "Users" });
      navigate("communities", { id: c.id });
    } catch (e) { toast.push({ title: "Einladung ungültig", desc: e instanceof Error ? e.message : "Beitritt fehlgeschlagen", tone: "danger", icon: "AlertTriangle" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Communities" subtitle="Öffentliche Netzwerke und private Gruppen auf deinem Server." icon="Users"
        actions={<><Button variant="secondary" onClick={() => setJoinOpen(true)}><Icon name="QrCode" size={16} /> Code</Button><Button onClick={() => setCreateOpen(true)}>+ Erstellen</Button></>} />
      <SearchInput placeholder="Community suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c, i) => (
          <Reveal key={c.id} delay={i * .04}>
            <Card className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name={c.isPrivate ? "Lock" : "Globe"} size={21} /></span>
                <div className="flex gap-1.5"><Badge tone={c.isPrivate ? "soil" : "info"}>{c.isPrivate ? "Privat" : "Öffentlich"}</Badge>{c.joined && <Badge tone="leaf">Mitglied</Badge>}</div>
              </div>
              <h2 className="mt-3 font-semibold">{c.name}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{c.description}</p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name="Users" size={13} /> {c.members} Mitglieder</div>
              <div className="mt-4 flex gap-2">
                {c.joined ? <Button className="flex-1" variant="secondary" onClick={() => navigate("communities", { id: c.id })}>Öffnen</Button>
                  : <Button className="flex-1" onClick={() => void joinPublic(c.id).then(() => toast.push({ title: "Beigetreten", desc: c.name, tone: "leaf", icon: "Users" }))} disabled={c.isPrivate}>{c.isPrivate ? "Code nötig" : "Beitreten"}</Button>}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Community erstellen">
        <div className="space-y-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Berlin Living Soil" /></Field>
          <Field label="Beschreibung"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
          <div className="flex items-center justify-between"><div><div className="text-sm font-medium">Privat</div><div className="text-xs text-fg-subtle">Beitritt nur per Code</div></div><Toggle checked={isPrivate} onChange={setIsPrivate} /></div>
          <Button className="w-full" onClick={createNow} loading={busy}>Erstellen</Button>
        </div>
      </BottomSheet>
      <BottomSheet open={joinOpen} onClose={() => setJoinOpen(false)} title="Per Code beitreten">
        <div className="space-y-4"><Field label="Einladungscode"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="go-inv_… (Demo: demo-private)" /></Field><Button className="w-full" onClick={joinCode} loading={busy}>Beitreten</Button></div>
      </BottomSheet>
    </div>
  );
}

type DetailTab = "feed" | "members" | "moderation";

function CommunityDetail({ id }: { id: string }) {
  const { back } = useNav();
  const toast = useToast();
  const me = useCurrentUser();
  const { community, loading, error, refresh, createInvite, setRole, kick } = useCommunity(id);
  const [invite, setInvite] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("feed");
  const [kicking, setKicking] = useState<{ id: string; name: string } | null>(null);
  const [ban, setBan] = useState(false);
  const [busy, setBusy] = useState(false);
  if (loading && !community) return <SkeletonCard className="mx-auto max-w-3xl" />;
  if (error || !community) return <EmptyState icon="AlertTriangle" title="Community nicht gefunden" desc={error ?? "Kein Inhalt."} />;
  const canAdmin = community.role === "admin";
  const canModerate = canAdmin || community.role === "moderator";
  const mayKick = (m: { id: string; role: string }) => canModerate && m.id !== me?.id && m.role !== "admin" && (canAdmin || m.role === "member");
  const confirmKick = async () => {
    if (!kicking) return;
    setBusy(true);
    try {
      await kick(kicking.id, ban);
      toast.push({ title: ban ? "Entfernt und gesperrt" : "Entfernt", desc: kicking.name, tone: "leaf", icon: "UserX" });
      setKicking(null); setBan(false);
    } catch (e) { toast.push({ title: "Entfernen fehlgeschlagen", desc: e instanceof Error ? e.message : "", tone: "danger", icon: "AlertTriangle" }); }
    finally { setBusy(false); }
  };
  const tabs: { value: DetailTab; label: string; count?: number }[] = [
    { value: "feed", label: "Feed" },
    { value: "members", label: `Mitglieder (${community.members})` },
    ...(canModerate ? [{ value: "moderation" as const, label: "Moderation", ...(community.openReports ? { count: community.openReports } : {}) }] : []),
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-fg-muted"><Icon name="ArrowLeft" size={16} /> Communities</button>
      <PageHeader title={community.name} subtitle={community.description} icon={community.isPrivate ? "Lock" : "Globe"}
        actions={canAdmin ? <Button onClick={() => void createInvite().then((x) => { setInvite(x.code); toast.push({ title: "Einladung erstellt", desc: "24 Stunden gültig.", tone: "leaf", icon: "QrCode" }); })}><Icon name="QrCode" size={16} /> Einladen</Button> : undefined} />
      {invite && <Card className="border-accent/25 bg-accent/5 p-4"><div className="text-xs text-fg-subtle">Einmal-Code</div><div className="mt-1 flex items-center justify-between gap-3"><code className="truncate font-semibold text-accent">{invite}</code><Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(invite)}>Kopieren</Button></div></Card>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "feed" && (community.joined
        ? <CommunityFeed communityId={id} canModerate={canModerate} />
        : <EmptyState icon="Lock" title="Nur für Mitglieder" desc="Tritt der Community bei, um Beiträge zu lesen und zu schreiben." />)}

      {tab === "members" && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">Mitglieder ({community.members})</h2>
          <div className="divide-y divide-border">
            {community.membersList.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-3" data-testid="member-row">
                <Avatar src={m.avatar} name={m.name} size={40} />
                <div className="min-w-0 flex-1"><div className="font-medium">{m.name}</div><div className="text-xs text-fg-subtle">{m.handle}</div></div>
                {canAdmin ? <Select aria-label={`Rolle von ${m.name}`} className="h-9 w-36 text-xs" value={m.role} onChange={(e) => void setRole(m.id, e.target.value as "member" | "moderator" | "admin")}><option value="member">member</option><option value="moderator">moderator</option><option value="admin">admin</option></Select> : <Badge>{m.role}</Badge>}
                {mayKick(m) && <Button size="sm" variant="ghost" aria-label={`${m.name} entfernen`} onClick={() => { setBan(false); setKicking({ id: m.id, name: m.name }); }}><Icon name="UserX" size={16} /></Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "moderation" && canModerate && <ModerationPanel communityId={id} isAdmin={canAdmin} onChanged={() => void refresh()} />}

      <Modal open={!!kicking} onClose={() => setKicking(null)} title="Mitglied entfernen" size="sm"
        footer={<><Button variant="ghost" onClick={() => setKicking(null)}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={() => void confirmKick()}>Entfernen</Button></>}>
        <div className="space-y-4" data-testid="kick-dialog">
          <p className="text-sm">{kicking?.name} verliert den Zugriff auf Feed und Beiträge dieser Community und wird benachrichtigt.</p>
          <Checkbox checked={ban} onChange={setBan} label="Dauerhaft sperren (kein erneuter Beitritt, auch nicht per Code)" />
        </div>
      </Modal>
    </div>
  );
}
