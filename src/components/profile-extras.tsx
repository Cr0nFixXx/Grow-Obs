import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Modal, SwipeLightbox, SmartImage } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { Icon } from "@/components/Icon";
import { useNav } from "@/lib/nav";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import { conditionLabel, conditionTone, statusLabel, visibilityLabel } from "@/lib/grows";
import { memberActivityTarget } from "@/lib/member-activity";
import type { MemberActivityItem, MemberGrowBrief } from "@/types";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Bitte noch einmal versuchen.");

/**
 * Profil- oder Titelbild antippbar (B-92): fremde Profile öffnen die Großansicht, das eigene ein Menü
 * „Ansehen / Ändern / Entfernen“. Ohne Bild und ohne Recht zum Ändern passiert beim Antippen nichts.
 */
export function ProfileImageMenu({ src, label, editable = false, onChange, className, children }: {
  src?: string;
  /** „Profilbild“ oder „Titelbild“ – für Beschriftungen. */
  label: string;
  editable?: boolean;
  /** Neuer Bildpfad oder `""` zum Entfernen. */
  onChange?: (path: string) => Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const clickable = editable || !!src;
  const open = () => { if (!clickable) return; if (editable) { setConfirmRemove(false); setMenu(true); } else setViewing(true); };
  const apply = async (path: string, done: { title: string; icon: string }) => {
    if (!onChange) return;
    setBusy(true);
    try {
      await onChange(path);
      setMenu(false);
      toast.push({ ...done, tone: "leaf" });
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: errorText(error), tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {clickable
        ? <button type="button" onClick={open} aria-label={editable ? `${label}: Menü öffnen` : `${label} ansehen`} className={className} data-testid={`image-menu-${label}`}>{children}</button>
        : <div className={className}>{children}</div>}
      {editable && (
        <Modal open={menu} onClose={() => !busy && setMenu(false)} title={label} size="sm">
          <div className="space-y-2" data-testid="image-menu">
            {src && <Button variant="secondary" className="w-full justify-start" onClick={() => { setMenu(false); setViewing(true); }}><Icon name="Eye" size={16} /> Ansehen</Button>}
            <ImagePickButton
              label={`${label} ändern`}
              onUploaded={(path) => apply(path, { title: `${label} geändert`, icon: "Camera" })}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium transition hover:bg-surface-3"
            >
              <Icon name="Camera" size={16} /> Ändern
            </ImagePickButton>
            {src && (confirmRemove
              ? (
                <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
                  <p>{label} wirklich entfernen?</p>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={busy} onClick={() => void apply("", { title: `${label} entfernt`, icon: "Trash2" })}>Entfernen</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>Abbrechen</Button>
                  </div>
                </div>
              )
              : <Button variant="ghost" className="w-full justify-start text-danger hover:bg-danger/10" onClick={() => setConfirmRemove(true)}><Icon name="Trash2" size={16} /> Entfernen</Button>)}
          </div>
        </Modal>
      )}
      {src && <SwipeLightbox open={viewing} images={[{ src, alt: label, caption: label }]} index={0} onIndexChange={() => undefined} onClose={() => setViewing(false)} />}
    </>
  );
}

/** Liste der Grows eines Mitglieds, die der Betrachter sehen darf (B-92). */
export function MemberGrowsModal({ handle, name, mine, onClose, onOpen }: { handle: string; name: string; mine: boolean; onClose: () => void; onOpen: (growId: string) => void }) {
  const { members } = useServices();
  const [items, setItems] = useState<MemberGrowBrief[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    members.grows(handle).then((r) => alive && setItems(r)).catch((e: unknown) => alive && setError(errorText(e)));
    return () => { alive = false; };
  }, [handle, members]);
  return (
    <Modal open onClose={onClose} title={mine ? "Meine Grows" : `Grows von ${name}`} size="md">
      <div data-testid="member-grows">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!items && !error && <p className="py-6 text-center text-sm text-fg-subtle" role="status">Wird geladen …</p>}
        {items && items.length === 0 && (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-fg-muted">
            {mine ? "Du hast noch keine Grows." : `${name} zeigt keine Grows öffentlich.`}
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => onOpen(g.id)} className="flex w-full items-center gap-3 rounded-xl border border-border p-2 text-left transition hover:bg-surface-2" data-testid="member-grow-item">
                  <SmartImage src={g.cover} alt="" className="size-14 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{g.name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{g.strain} · {g.status === "active" ? `${g.phase}, Tag ${g.day}/${g.totalDays}` : statusLabel[g.status]}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={conditionTone[g.condition]}>{conditionLabel[g.condition]}</Badge>
                    {mine && <span className="text-[11px] text-fg-subtle">{visibilityLabel[g.visibility]}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

const KIND_TEXT: Record<MemberActivityItem["kind"], { icon: string; verb: string }> = {
  thread: { icon: "MessagesSquare", verb: "hat im Forum gepostet:" },
  comment: { icon: "MessageCircle", verb: "hat im Forum kommentiert:" },
  wiki: { icon: "BookOpen", verb: "hat im Wiki geschrieben:" },
};

/** Forum- und Wiki-Aktivität eines Mitglieds (B-92); ein Tipp öffnet Thread bzw. Artikel. */
export function MemberActivityCard({ handle, title = "Letzte Aktivität" }: { handle: string; title?: string }) {
  const { members } = useServices();
  const { navigate } = useNav();
  const [items, setItems] = useState<MemberActivityItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setItems(null); setError("");
    members.activity(handle).then((r) => alive && setItems(r)).catch((e: unknown) => alive && setError(errorText(e)));
    return () => { alive = false; };
  }, [handle, members]);
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-label={title} data-testid="member-activity">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{title}</h2>
      {error && <p role="alert" className="py-3 text-center text-sm text-danger">{error}</p>}
      {!items && !error && <p className="py-4 text-center text-sm text-fg-subtle" role="status">Wird geladen …</p>}
      {items && items.length === 0 && <p className="py-4 text-center text-sm text-fg-subtle">Noch keine Forum- oder Wiki-Beiträge.</p>}
      {items && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => {
            const meta = KIND_TEXT[a.kind];
            return (
              <li key={a.id}>
                <button type="button" onClick={() => { const t = memberActivityTarget(a); navigate(t.view, t.params); }} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2" data-testid="member-activity-item">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted"><Icon name={meta.icon} size={15} /></span>
                  <span className="min-w-0 flex-1 text-sm"><span className="text-fg-muted">{meta.verb} </span><span className="font-medium">{a.title}</span>{a.sub && <span className="text-fg-subtle"> · {a.sub}</span>}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">{a.ago}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
