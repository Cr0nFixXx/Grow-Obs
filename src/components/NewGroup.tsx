import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar, Button, Modal } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { PeoplePicker } from "@/components/PeoplePicker";
import { MAX_GROUP_MEMBERS, MAX_GROUP_NAME } from "@/lib/chat-groups";
import type { ChatPerson, CreateGroupInput } from "@/services/interfaces";

/** „Neue Gruppe“ (B-65): Name (Pflicht), Gruppenbild (optional), Personen einladen – sie treten erst nach Annahme bei. */
export function NewGroupModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateGroupInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!open) { setName(""); setAvatar(""); setPeople([]); setBusy(false); setError(null); } }, [open]);

  const valid = name.trim().length > 0 && people.length > 0;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      await onCreate({ name: name.trim(), ...(avatar ? { avatar } : {}), userIds: people.map((p) => p.id) });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gruppe konnte nicht erstellt werden");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neue Gruppe"
      size="sm"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={() => void submit()} disabled={!valid || busy}>{busy ? "Erstelle …" : "Gruppe erstellen"}</Button></div>}
    >
      <div className="space-y-4" data-testid="new-group">
        <div className="flex items-center gap-3">
          <ImagePickButton onUploaded={(path) => setAvatar(path)} label="Gruppenbild wählen" className="relative grid size-16 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted hover:bg-surface-3">
            {avatar ? <Avatar src={avatar} name={name || "Gruppe"} size={64} /> : <Camera className="size-6" />}
          </ImagePickButton>
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              value={name}
              maxLength={MAX_GROUP_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gruppenname"
              aria-label="Gruppenname"
              className="h-11 w-full rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent"
            />
            <div className="mt-1 flex justify-between text-[11px] text-fg-subtle"><span>Pflichtfeld · Bild optional</span><span>{name.length}/{MAX_GROUP_NAME}</span></div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-muted">Einladen (höchstens {MAX_GROUP_MEMBERS - 1})</div>
          <PeoplePicker selected={people} onChange={setPeople} max={MAX_GROUP_MEMBERS - 1} label="Personen suchen" />
        </div>
        <p className="text-xs text-fg-subtle">Eingeladene treten erst bei, wenn sie die Einladung annehmen. Einladungen laufen nach 7 Tagen ab.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
