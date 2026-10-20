import { useEffect, useState } from "react";
import { Camera, LogOut, UserMinus, X } from "lucide-react";
import { Avatar, Button, Modal, Toggle } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { PeoplePicker } from "@/components/PeoplePicker";
import { GroupTopics } from "@/components/GroupTopics";
import { useToast } from "@/components/Toast";
import { MAX_GROUP_NAME, expiryLabel, freeSlots, inviteSummary } from "@/lib/chat-groups";
import { cn } from "@/utils/cn";
import type { GroupActions } from "@/data/hooks";
import type { ChatPerson, GroupDetail } from "@/services/interfaces";

export type GroupTab = "general" | "members" | "topics";
const TABS: { id: GroupTab; label: string }[] = [{ id: "general", label: "Allgemein" }, { id: "members", label: "Mitglieder" }, { id: "topics", label: "Themen" }];
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Unbekannter Fehler");

/** Gruppen-Info (B-65): Einstellungen, Mitglieder samt Einladungen, Themen, Gruppe verlassen. */
export function GroupInfoModal({ open, onClose, group, actions, initialTab = "general" }: { open: boolean; onClose: () => void; group: GroupDetail; actions: GroupActions; initialTab?: GroupTab }) {
  const toast = useToast();
  const [tab, setTab] = useState<GroupTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const admin = group.role === "admin";

  const fail = (title: string, e: unknown) => toast.push({ title, desc: errorText(e), tone: "danger", icon: "AlertTriangle" });

  return (
    <Modal open={open} onClose={onClose} title={group.name} size="md">
      <div className="space-y-4" data-testid="group-info">
        <div role="tablist" aria-label="Gruppen-Info" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("h-9 flex-1 rounded-lg text-sm font-semibold transition", tab === t.id ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>{t.label}</button>
          ))}
        </div>
        {tab === "general" && <General group={group} actions={actions} admin={admin} onLeft={onClose} fail={fail} />}
        {tab === "members" && <Members group={group} actions={actions} admin={admin} fail={fail} />}
        {tab === "topics" && <GroupTopics group={group} actions={actions} />}
      </div>
    </Modal>
  );
}

function General({ group, actions, admin, onLeft, fail }: { group: GroupDetail; actions: GroupActions; admin: boolean; onLeft: () => void; fail: (t: string, e: unknown) => void }) {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => setName(group.name), [group.name]);
  const run = async (title: string, fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { fail(title, e); } finally { setBusy(false); } };
  const others = group.memberCount - 1;
  const lastAdmin = admin && group.members.filter((m) => m.role === "admin").length === 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {admin ? (
          <ImagePickButton onUploaded={(path) => run("Bild nicht gespeichert", () => actions.update({ avatar: path }))} label="Gruppenbild ändern" className="relative grid size-16 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted hover:bg-surface-3">
            {group.avatar ? <Avatar src={group.avatar} name={group.name} size={64} /> : <Camera className="size-6" />}
          </ImagePickButton>
        ) : <Avatar src={group.avatar} name={group.name} size={64} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          {admin ? (
            <div className="flex gap-2">
              <input value={name} maxLength={MAX_GROUP_NAME} onChange={(e) => setName(e.target.value)} aria-label="Gruppenname" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-accent" />
              <Button size="sm" disabled={busy || !name.trim() || name.trim() === group.name} onClick={() => void run("Name nicht gespeichert", () => actions.update({ name: name.trim() }))}>Speichern</Button>
            </div>
          ) : <div className="truncate text-base font-semibold">{group.name}</div>}
          <div className="text-xs text-fg-muted">{group.memberCount} von {group.maxMembers} Mitgliedern</div>
          {admin && group.avatar && <button type="button" onClick={() => void run("Bild nicht entfernt", () => actions.update({ avatar: null }))} className="text-xs text-fg-muted underline hover:text-fg">Bild entfernen</button>}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="text-sm">
          <div className="font-semibold">Verlauf für neue Mitglieder sichtbar</div>
          <div className="text-xs text-fg-muted">{group.historyVisible ? "Neue Mitglieder sehen auch ältere Nachrichten." : "Neue Mitglieder sehen nur Nachrichten ab ihrem Beitritt."}</div>
        </div>
        {admin ? <Toggle checked={group.historyVisible} label="Verlauf für neue Mitglieder sichtbar" onChange={(v) => void run("Einstellung nicht gespeichert", () => actions.update({ historyVisible: v }))} /> : <span className="text-xs font-semibold text-fg-muted">{group.historyVisible ? "Ja" : "Nein"}</span>}
      </div>

      <div className="space-y-2 rounded-xl border border-border p-3">
        {confirmLeave ? (
          <>
            <p className="text-sm">{others === 0 ? "Du bist das letzte Mitglied – die Gruppe wird samt Nachrichten gelöscht." : lastAdmin ? "Du bist der einzige Admin. Das am längsten dabei seiende Mitglied wird Admin." : "Du kannst nur per neuer Einladung zurückkehren."}</p>
            <div className="flex gap-2"><Button variant="danger" disabled={busy} onClick={() => void run("Nicht verlassen", async () => { await actions.leave(); onLeft(); })}>Ja, verlassen</Button><Button variant="ghost" onClick={() => setConfirmLeave(false)}>Abbrechen</Button></div>
          </>
        ) : <Button variant="ghost" onClick={() => setConfirmLeave(true)} className="text-danger"><LogOut className="size-4" />Gruppe verlassen</Button>}
      </div>
    </div>
  );
}

function Members({ group, actions, admin, fail }: { group: GroupDetail; actions: GroupActions; admin: boolean; fail: (t: string, e: unknown) => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const slots = freeSlots(group);
  const exclude = [...group.members.map((m) => m.id), ...group.invites.map((i) => i.userId)];

  const run = async (title: string, fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { fail(title, e); } finally { setBusy(false); } };
  const invite = () => run("Nicht eingeladen", async () => {
    const result = await actions.invite(picked.map((p) => p.id));
    setPicked([]);
    toast.push({ title: "Einladungen", desc: inviteSummary(result), tone: result.invited.length ? "leaf" : "info", icon: "Send" });
  });

  return (
    <div className="space-y-4">
      <ul className="space-y-1" aria-label="Mitglieder">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl p-2">
            <Avatar src={m.avatar} name={m.name} size={36} status={m.online ? "online" : "offline"} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{m.name}{m.id === group.meId && <span className="ml-1.5 text-xs font-normal text-fg-subtle">(Du)</span>}</div>
              <div className="truncate text-xs text-fg-muted">@{m.handle}</div>
            </div>
            {m.role === "admin" && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">Admin</span>}
            {admin && m.id !== group.meId && (confirmId === m.id
              ? <span className="flex items-center gap-1"><Button size="sm" variant="danger" disabled={busy} onClick={() => void run("Nicht entfernt", async () => { await actions.removeMember(m.id); setConfirmId(null); })}>Entfernen</Button><button type="button" onClick={() => setConfirmId(null)} aria-label="Abbrechen" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"><X className="size-4" /></button></span>
              : <button type="button" onClick={() => setConfirmId(m.id)} aria-label={`${m.name} entfernen`} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-danger"><UserMinus className="size-4" /></button>)}
          </li>
        ))}
      </ul>

      {admin && group.invites.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-fg-muted">Offene Einladungen</div>
          <ul className="space-y-1" aria-label="Offene Einladungen">
            {group.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-xl p-2">
                <Avatar src={i.avatar} name={i.name} size={32} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{i.name}</div><div className="text-xs text-fg-muted">{expiryLabel(i.expiresAt)}</div></div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("Nicht zurückgezogen", () => actions.revokeInvite(i.id))}>Zurückziehen</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {admin ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="text-xs font-semibold text-fg-muted">Einladen · {slots} {slots === 1 ? "Platz" : "Plätze"} frei</div>
          {slots === 0 ? <p className="text-sm text-fg-muted">Die Gruppe ist voll (Mitglieder und offene Einladungen zählen).</p> : (
            <>
              <PeoplePicker selected={picked} onChange={setPicked} exclude={exclude} max={slots} label="Personen zum Einladen suchen" />
              <Button onClick={() => void invite()} disabled={busy || picked.length === 0}>{picked.length > 1 ? `${picked.length} Personen einladen` : "Einladen"}</Button>
            </>
          )}
        </div>
      ) : <p className="text-xs text-fg-subtle">Nur Admins laden ein oder entfernen Mitglieder.</p>}
    </div>
  );
}
