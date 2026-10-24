import { useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useServices } from "@/data/DataContext";
import { GROW_MEDIUMS, GROW_TYPES, conditionLabel, todayLocal } from "@/lib/grows";
import type { FinishGrowInput, Grow, GrowCondition, UpdateGrowInput } from "@/types";

/** Gemeinsamer Fehlerton für alle Grow-Dialoge. */
function useGrowAction(onDone: (grow?: Grow) => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<Grow | void>, success?: { title: string; desc?: string; icon: string }) => {
    setBusy(true);
    setError("");
    try {
      const grow = await fn();
      if (success) toast.push({ ...success, tone: "leaf" });
      onDone(grow ?? undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ErrorLine({ error }: { error: string }) {
  return error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null;
}

/** Gramm-Eingabe → ganze Zahl oder `null` (leer); `NaN` bei Unsinn. */
export function parseGrams(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : Number.NaN;
}

/* ------------------------------ Bearbeiten ------------------------------ */

export function EditGrowModal({ grow, open, onClose, onSaved }: { grow: Grow; open: boolean; onClose: () => void; onSaved: (grow: Grow) => void }) {
  const svc = useServices();
  const [name, setName] = useState(grow.name);
  const [strain, setStrain] = useState(grow.strain);
  const [breeder, setBreeder] = useState(grow.breeder);
  const [type, setType] = useState(grow.type);
  const [medium, setMedium] = useState(grow.medium);
  const [startDate, setStartDate] = useState(grow.startDate.slice(0, 10));
  const [totalDays, setTotalDays] = useState(String(grow.totalDays));
  const [expectedYield, setExpectedYield] = useState(grow.expectedYield === "—" ? "" : grow.expectedYield);
  const { busy, error, run } = useGrowAction((g) => g && onSaved(g));
  const [touched, setTouched] = useState(false);

  const days = Number(totalDays);
  const problems = {
    name: name.trim() ? "" : "Bitte einen Namen angeben.",
    strain: strain.trim() ? "" : "Bitte eine Sorte angeben.",
    startDate: startDate && startDate <= todayLocal() ? "" : "Startdatum darf nicht in der Zukunft liegen.",
    totalDays: Number.isInteger(days) && days >= 14 && days <= 400 ? "" : "Zwischen 14 und 400 Tagen.",
  };
  const valid = Object.values(problems).every((p) => !p);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const patch: UpdateGrowInput = {
      name: name.trim(), strain: strain.trim(), breeder: breeder.trim(), type, medium, startDate, totalDays: days,
      expectedYield: expectedYield.trim() || "—",
    };
    void run(() => svc.grows.update(grow.id, patch), { title: "Grow gespeichert", desc: patch.name, icon: "Save" });
  };

  return (
    <Modal open={open} onClose={onClose} title="Grow bearbeiten" size="md">
      <form noValidate onSubmit={submit} className="space-y-4" data-testid="edit-grow-form">
        <Field label="Name des Grows"><Input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && !!problems.name} /></Field>
        {touched && <ErrorLine error={problems.name} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sorte"><Input value={strain} onChange={(e) => setStrain(e.target.value)} aria-invalid={touched && !!problems.strain} /></Field>
          <Field label="Breeder"><Input value={breeder} onChange={(e) => setBreeder(e.target.value)} /></Field>
        </div>
        {touched && <ErrorLine error={problems.strain} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Typ">
            <Select value={type} onChange={(e) => setType(e.target.value as Grow["type"])}>{GROW_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          </Field>
          <Field label="Medium">
            <Select value={medium} onChange={(e) => setMedium(e.target.value)}>
              {(GROW_MEDIUMS.includes(medium) ? GROW_MEDIUMS : [medium, ...GROW_MEDIUMS]).map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Startdatum" hint="Der Tag wird daraus berechnet.">
            <Input type="date" value={startDate} max={todayLocal()} onChange={(e) => setStartDate(e.target.value)} aria-invalid={touched && !!problems.startDate} />
          </Field>
          <Field label="Geplante Dauer (Tage)">
            <Input inputMode="numeric" value={totalDays} onChange={(e) => setTotalDays(e.target.value)} aria-invalid={touched && !!problems.totalDays} />
          </Field>
        </div>
        {touched && <ErrorLine error={problems.startDate || problems.totalDays} />}
        <Field label="Erwarteter Ertrag" hint="optional, z. B. „400 g“"><Input value={expectedYield} onChange={(e) => setExpectedYield(e.target.value)} /></Field>
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" loading={busy}><Icon name="Save" size={16} /> Speichern</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Ernte / Abbruch ------------------------------ */

export function FinishGrowModal({
  grow,
  open,
  initialOutcome,
  onClose,
  onSaved,
}: {
  grow: Grow;
  open: boolean;
  initialOutcome: "harvested" | "aborted";
  onClose: () => void;
  onSaved: (grow: Grow) => void;
}) {
  const svc = useServices();
  const [outcome, setOutcome] = useState<"harvested" | "aborted">(initialOutcome);
  const [date, setDate] = useState(grow.endedOn ?? todayLocal());
  const [wet, setWet] = useState(grow.harvest?.wetG != null ? String(grow.harvest.wetG) : "");
  const [dry, setDry] = useState(grow.harvest?.dryG != null ? String(grow.harvest.dryG) : "");
  const [note, setNote] = useState(grow.harvest?.note ?? "");
  const { busy, error, run } = useGrowAction((g) => g && onSaved(g));
  const [touched, setTouched] = useState(false);
  const editing = grow.status !== "active";
  const harvested = outcome === "harvested";

  const wetG = parseGrams(wet);
  const dryG = parseGrams(dry);
  const problem =
    !date ? "Bitte ein Datum angeben." :
    date > todayLocal() ? "Das Datum liegt in der Zukunft." :
    date < grow.startDate.slice(0, 10) ? "Das Datum liegt vor dem Start des Grows." :
    harvested && (Number.isNaN(wetG) || Number.isNaN(dryG)) ? "Gewichte bitte als Zahl in Gramm angeben." :
    harvested && wetG != null && dryG != null && dryG > wetG ? "Das Trockengewicht kann nicht größer als das Nassgewicht sein." : "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    const input: FinishGrowInput = { outcome, date, note: note.trim(), ...(harvested ? { wetG, dryG } : {}) };
    void run(() => svc.grows.finish(grow.id, input), harvested ? { title: editing ? "Ernte aktualisiert" : "Ernte abgeschlossen", desc: grow.name, icon: "Scissors" } : { title: "Grow abgebrochen", desc: grow.name, icon: "Flag" });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Abschluss bearbeiten" : harvested ? "Ernte abschließen" : "Grow abbrechen"} size="md">
      <form noValidate onSubmit={submit} className="space-y-4" data-testid="finish-grow-form">
        <Segmented
          value={outcome}
          onChange={setOutcome}
          options={[{ value: "harvested", label: "Geerntet", icon: "Scissors" }, { value: "aborted", label: "Abgebrochen", icon: "Flag" }]}
        />
        <p className="text-sm text-fg-muted">
          {harvested
            ? "Der Grow wird abgeschlossen, bleibt sichtbar und zählt in deinem Profil als Ernte. Du kannst ihn später wieder aufnehmen."
            : "Der Grow wird beendet, zählt aber nicht als Ernte. Einträge und Fotos bleiben erhalten."}
        </p>
        <Field label={harvested ? "Erntedatum" : "Abbruchdatum"}>
          <Input type="date" value={date} min={grow.startDate.slice(0, 10)} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {harvested && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nassgewicht (g)" hint="optional"><Input inputMode="numeric" value={wet} onChange={(e) => setWet(e.target.value)} placeholder="z. B. 450" /></Field>
            <Field label="Trockengewicht (g)" hint="optional, auch später nachtragbar"><Input inputMode="numeric" value={dry} onChange={(e) => setDry(e.target.value)} placeholder="z. B. 110" /></Field>
          </div>
        )}
        <Field label="Notiz" hint="optional"><Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={harvested ? "Eindruck, Geruch, Besonderheiten …" : "Warum wurde abgebrochen?"} /></Field>
        {touched && <ErrorLine error={problem} />}
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Zurück</Button>
          <Button type="submit" loading={busy} variant={harvested ? "primary" : "danger"}>
            <Icon name={harvested ? "Scissors" : "Flag"} size={16} /> {editing ? "Speichern" : harvested ? "Ernte abschließen" : "Grow abbrechen"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Löschen ------------------------------ */

export function DeleteGrowModal({
  grow,
  open,
  onClose,
  onDeleted,
  onArchive,
}: {
  grow: Grow;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onArchive: () => void;
}) {
  const svc = useServices();
  const { busy, error, run } = useGrowAction(() => onDeleted());
  const photos = grow.gallery.length;
  return (
    <Modal open={open} onClose={onClose} title="Grow endgültig löschen?" size="sm">
      <div className="space-y-4" data-testid="delete-grow-dialog">
        <p className="text-sm text-fg-muted">
          „{grow.name}“ wird mit {grow.logs.length} {grow.logs.length === 1 ? "Eintrag" : "Einträgen"}, {grow.env.length} Messwerten und {photos} {photos === 1 ? "Foto" : "Fotos"} unwiderruflich gelöscht.
          Die Bilder werden auch aus dem Speicher entfernt.
        </p>
        {!grow.archived && (
          <button type="button" onClick={onArchive} className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-surface-2 p-3 text-left text-sm transition hover:border-accent/50">
            <Icon name="Archive" size={16} className="mt-0.5 shrink-0 text-accent" />
            <span><span className="font-medium">Lieber archivieren</span><span className="block text-xs text-fg-subtle">Der Grow verschwindet aus der Liste, bleibt aber erhalten und lässt sich zurückholen.</span></span>
          </button>
        )}
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="danger" loading={busy} onClick={() => void run(() => svc.grows.remove(grow.id), { title: "Grow gelöscht", desc: grow.name, icon: "Trash2" })}>
            <Icon name="Trash2" size={16} /> Endgültig löschen
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const conditionOptions = (Object.keys(conditionLabel) as GrowCondition[]).map((value) => ({ value, label: conditionLabel[value] }));
