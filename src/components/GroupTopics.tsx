import { useState } from "react";
import { ArrowDown, ArrowUp, Bell, BellOff, Lock, Pin, Trash2 } from "lucide-react";
import { Button, Checkbox, Toggle } from "@/components/ui";
import { EmojiPicker } from "@/components/media";
import { useToast } from "@/components/Toast";
import { MAX_TOPIC_NAME, topicBadges } from "@/lib/chat-groups";
import type { GroupActions } from "@/data/hooks";
import type { GroupDetail, GroupTopic } from "@/services/interfaces";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

/** Auswahl aus den Gruppenmitgliedern (private Themen). */
function MemberChecklist({ group, value, onChange }: { group: GroupDetail; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2" aria-label="Mitglieder des Themas">
      {group.members.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{m.name}{m.role === "admin" && <span className="ml-1.5 text-[10px] text-fg-subtle">sieht immer alles</span>}</span>
          <Checkbox checked={m.role === "admin" || value.includes(m.id)} onChange={(on) => { if (m.role !== "admin") onChange(on ? [...value, m.id] : value.filter((x) => x !== m.id)); }} label={m.name} />
        </li>
      ))}
    </ul>
  );
}

function TopicRow({ group, topic, index, actions, admin }: { group: GroupDetail; topic: GroupTopic; index: number; actions: GroupActions; admin: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(topic.name);
  const [emoji, setEmoji] = useState(topic.emoji);
  const [members, setMembers] = useState<string[]>(topic.memberIds ?? []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.push({ title: "Nicht gespeichert", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); } finally { setBusy(false); }
  };
  const badges = topicBadges(topic);
  const sameGroup = group.topics.filter((t) => t.pinned === topic.pinned);
  const posInGroup = sameGroup.findIndex((t) => t.id === topic.id);

  return (
    <li className="rounded-xl border border-border" data-testid="topic-row">
      <div className="flex items-center gap-2 p-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-base" aria-hidden>{topic.emoji || "#"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold"><span className="truncate">{topic.name}</span>{topic.private && <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="privat" />}{topic.pinned && <Pin className="size-3 shrink-0 text-fg-subtle" aria-label="angeheftet" />}</div>
          {badges.length > 0 && <div className="truncate text-[11px] text-fg-subtle">{badges.join(" · ")}</div>}
        </div>
        <button type="button" disabled={busy} onClick={() => void run(() => actions.muteTopic(topic.id, !topic.muted))} aria-label={topic.muted ? `${topic.name}: Stummschaltung aufheben` : `${topic.name} stummschalten`} aria-pressed={topic.muted} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 disabled:opacity-50">
          {topic.muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </button>
        {admin && <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Schließen" : "Bearbeiten"}</Button>}
      </div>
      {admin && open && (
        <div className="space-y-3 border-t border-border p-3" data-testid="topic-edit">
          <div className="flex items-center gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" className="h-10 w-14 rounded-xl border border-border bg-surface-2 px-2 text-center text-sm outline-none focus:border-accent" />
            <EmojiPicker onPick={(e) => setEmoji(e)} />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_TOPIC_NAME} aria-label="Themenname" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-accent" />
            <Button size="sm" disabled={busy || !name.trim() || (name.trim() === topic.name && emoji.trim() === topic.emoji)} onClick={() => void run(() => actions.updateTopic(topic.id, { name: name.trim(), emoji: emoji.trim() }))}>Speichern</Button>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <label className="flex items-center justify-between gap-2"><span>Angeheftet</span><Toggle checked={topic.pinned} label="Angeheftet" onChange={(v) => void run(() => actions.updateTopic(topic.id, { pinned: v }))} /></label>
            <label className="flex items-center justify-between gap-2"><span>Nur Admins schreiben</span><Toggle checked={topic.adminsOnly} label="Nur Admins schreiben" onChange={(v) => void run(() => actions.updateTopic(topic.id, { adminsOnly: v }))} /></label>
            <label className="flex items-center justify-between gap-2"><span>Geschlossen</span><Toggle checked={topic.closed} label="Geschlossen" onChange={(v) => void run(() => actions.updateTopic(topic.id, { closed: v }))} /></label>
          </div>
          {topic.private && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-fg-muted">Mitglieder des privaten Themas</div>
              <MemberChecklist group={group} value={members} onChange={setMembers} />
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => actions.setTopicMembers(topic.id, members))}>Mitglieder speichern</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={busy || index === 0 || posInGroup <= 0} onClick={() => void run(() => actions.moveTopic(topic.id, "up"))} aria-label={`${topic.name} nach oben`}><ArrowUp className="size-4" />Hoch</Button>
            <Button size="sm" variant="ghost" disabled={busy || posInGroup < 0 || posInGroup >= sameGroup.length - 1} onClick={() => void run(() => actions.moveTopic(topic.id, "down"))} aria-label={`${topic.name} nach unten`}><ArrowDown className="size-4" />Runter</Button>
            {!topic.isDefault && (confirmDelete
              ? <><span className="text-xs text-danger">Thema samt Nachrichten löschen?</span><Button size="sm" variant="danger" disabled={busy} onClick={() => void run(() => actions.deleteTopic(topic.id))}>Ja, löschen</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Nein</Button></>
              : <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={`${topic.name} löschen`}><Trash2 className="size-4" />Löschen</Button>)}
          </div>
        </div>
      )}
    </li>
  );
}

/** Reiter „Themen“: alle sehen und stummschalten, Admins legen an, benennen um, heften an, schließen, ordnen, löschen. */
export function GroupTopics({ group, actions }: { group: GroupDetail; actions: GroupActions }) {
  const toast = useToast();
  const admin = group.role === "admin";
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [priv, setPriv] = useState(false);
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await actions.createTopic({ name: name.trim(), emoji: emoji.trim(), private: priv, adminsOnly, userIds: priv ? members : [] });
      setName(""); setEmoji(""); setPriv(false); setAdminsOnly(false); setMembers([]);
      toast.push({ title: "Thema erstellt", tone: "leaf", icon: "CheckCircle2" });
    } catch (e) { toast.push({ title: "Thema nicht erstellt", desc: errorText(e), tone: "danger", icon: "AlertTriangle" }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="group-topics">
      <ul className="space-y-2" aria-label="Themen">
        {group.topics.map((t, i) => <TopicRow key={`${t.id}:${t.name}:${t.emoji}`} group={group} topic={t} index={i} actions={actions} admin={admin} />)}
      </ul>
      {admin ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
          <div className="text-xs font-semibold text-fg-muted">Neues Thema</div>
          <div className="flex items-center gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder="🌱" aria-label="Emoji für neues Thema" className="h-10 w-14 rounded-xl border border-border bg-surface-2 px-2 text-center text-sm outline-none focus:border-accent" />
            <EmojiPicker onPick={(e) => setEmoji(e)} />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_TOPIC_NAME} placeholder="Themenname" aria-label="Name des neuen Themas" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-accent" />
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2"><span>Privat (eigene Mitglieder)</span><Toggle checked={priv} label="Privates Thema" onChange={setPriv} /></label>
            <label className="flex items-center justify-between gap-2"><span>Nur Admins schreiben</span><Toggle checked={adminsOnly} label="Neues Thema nur für Admins" onChange={setAdminsOnly} /></label>
          </div>
          {priv && <MemberChecklist group={group} value={members} onChange={setMembers} />}
          <Button onClick={() => void create()} disabled={!name.trim() || busy}>Thema erstellen</Button>
        </div>
      ) : <p className="text-xs text-fg-subtle">Nur Admins legen Themen an und verwalten sie. Stumm geschaltete Themen zählen nicht in den Ungelesen-Zählern und senden keinen Push.</p>}
    </div>
  );
}
