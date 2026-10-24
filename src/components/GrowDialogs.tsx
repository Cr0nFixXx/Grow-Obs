import { useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useServices } from "@/data/DataContext";
import { GROW_MEDIUMS, GROW_TYPES, conditionLabel, dayDiff, formatDay, todayLocal, vpdKpa } from "@/lib/grows";
import { resolveMedia } from "@/lib/media";
import type { EnvPoint, FinishGrowInput, Grow, GrowCondition, GrowLog, GrowPhoto, UpdateGrowInput } from "@/types";

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
  const [leafOffset, setLeafOffset] = useState(String(grow.leafOffset).replace(".", ","));
  const { busy, error, run } = useGrowAction((g) => g && onSaved(g));
  const [touched, setTouched] = useState(false);

  const days = Number(totalDays);
  const offset = Number(leafOffset.trim().replace(",", ".") || Number.NaN);
  const problems = {
    name: name.trim() ? "" : "Bitte einen Namen angeben.",
    strain: strain.trim() ? "" : "Bitte eine Sorte angeben.",
    startDate: startDate && startDate <= todayLocal() ? "" : "Startdatum darf nicht in der Zukunft liegen.",
    totalDays: Number.isInteger(days) && days >= 14 && days <= 400 ? "" : "Zwischen 14 und 400 Tagen.",
    leafOffset: Number.isFinite(offset) && offset >= 0 && offset <= 6 ? "" : "Blatt-Abzug zwischen 0 und 6 °C.",
  };
  const valid = Object.values(problems).every((p) => !p);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const patch: UpdateGrowInput = {
      name: name.trim(), strain: strain.trim(), breeder: breeder.trim(), type, medium, startDate, totalDays: days,
      expectedYield: expectedYield.trim() || "—", leafOffset: offset,
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Erwarteter Ertrag" hint="optional, z. B. „400 g“"><Input value={expectedYield} onChange={(e) => setExpectedYield(e.target.value)} /></Field>
          <Field label="Blatt-Abzug (°C)" hint="fürs VPD: Blatt = Luft minus Abzug, Standard 2">
            <Input inputMode="decimal" value={leafOffset} onChange={(e) => setLeafOffset(e.target.value)} aria-invalid={touched && !!problems.leafOffset} />
          </Field>
        </div>
        {touched && <ErrorLine error={problems.leafOffset} />}
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
  const photos = grow.photos.length;
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


/* ------------------------------ Log-Eintrag ------------------------------ */

export const LOG_TAGS: GrowLog["tag"][] = ["Gießen", "Dünger", "Training", "Beobachtung", "Schädling", "Ernte"];

export function EditLogModal({ grow, log, open, onClose, onSaved }: { grow: Grow; log: GrowLog; open: boolean; onClose: () => void; onSaved: () => void }) {
  const svc = useServices();
  const [title, setTitle] = useState(log.title);
  const [text, setText] = useState(log.text);
  const [tag, setTag] = useState(log.tag);
  const [date, setDate] = useState(log.date.slice(0, 10));
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useGrowAction(() => onSaved());
  const start = grow.startDate.slice(0, 10);
  const problem = !title.trim() ? "Bitte einen Titel angeben." : !date ? "Bitte ein Datum angeben." : date < start ? "Das Datum liegt vor dem Start des Grows." : date > todayLocal() ? "Das Datum liegt in der Zukunft." : "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    void run(async () => { await svc.grows.updateLog(grow.id, log.id, { title: title.trim(), text: text.trim(), tag, date }); }, { title: "Eintrag gespeichert", desc: title.trim(), icon: "Save" });
  };

  return (
    <Modal open={open} onClose={onClose} title="Eintrag bearbeiten" size="md">
      <form noValidate onSubmit={submit} className="space-y-4" data-testid="edit-log-form">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Kategorie</span>
          <div className="flex flex-wrap gap-2">
            {LOG_TAGS.map((t) => (
              <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(t)} className={`min-h-10 rounded-full border px-3.5 text-sm transition ${tag === t ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:bg-surface-2"}`}>{t}</button>
            ))}
          </div>
        </div>
        <Field label="Titel"><Input value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={touched && !title.trim()} /></Field>
        <Field label="Datum" hint={date && date >= start && date <= todayLocal() ? `Tag ${dayDiff(start, date)} des Grows` : undefined}>
          <Input type="date" aria-label="Datum" value={date} min={start} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notiz" hint="optional"><Textarea rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        {touched && <ErrorLine error={problem} />}
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="danger" loading={busy} onClick={() => void run(() => svc.grows.deleteLog(grow.id, log.id), { title: "Eintrag gelöscht", desc: log.title, icon: "Trash2" })} data-testid="confirm-delete-log"><Icon name="Trash2" size={16} /> Wirklich löschen</Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Nein</Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-log"><Icon name="Trash2" size={16} /> Löschen</Button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" loading={busy}><Icon name="Save" size={16} /> Speichern</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Foto ------------------------------ */

export function PhotoModal({ grow, photo, open, onClose, onSaved }: { grow: Grow; photo: GrowPhoto; open: boolean; onClose: () => void; onSaved: () => void }) {
  const svc = useServices();
  const [caption, setCaption] = useState(photo.caption);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useGrowAction(() => onSaved());
  const changed = caption.trim() !== photo.caption;
  const lastPhoto = grow.photos.length === 1;

  return (
    <Modal open={open} onClose={onClose} title="Foto bearbeiten" size="md">
      <div className="space-y-4" data-testid="photo-dialog">
        <img src={resolveMedia(photo.url)} alt={photo.caption || "Foto"} className="max-h-64 w-full rounded-xl object-cover" />
        <Field label="Bildunterschrift" hint="optional">
          <Input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder="z. B. Tag 35, Beginn der Blüte" />
        </Field>
        {photo.cover ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted"><Icon name="Star" size={16} className="text-accent" /> Dieses Foto ist das Titelbild.</p>
        ) : (
          <Button type="button" variant="secondary" loading={busy} onClick={() => void run(() => svc.grows.updatePhoto(grow.id, photo.id, { cover: true }), { title: "Titelbild geändert", desc: grow.name, icon: "Star" })} data-testid="photo-cover">
            <Icon name="Star" size={16} /> Als Titelbild verwenden
          </Button>
        )}
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="danger" loading={busy} onClick={() => void run(() => svc.grows.deletePhoto(grow.id, photo.id), { title: "Foto gelöscht", desc: grow.name, icon: "Trash2" })} data-testid="confirm-delete-photo"><Icon name="Trash2" size={16} /> Endgültig löschen</Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Nein</Button>
              <p className="w-full text-xs text-fg-subtle">Die Datei wird auch aus dem Speicher entfernt.{photo.cover && !lastPhoto ? " Das nächste Foto wird Titelbild." : ""}</p>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-photo"><Icon name="Trash2" size={16} /> Löschen …</Button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose}>Schließen</Button>
            <Button type="button" disabled={!changed} loading={busy} onClick={() => void run(() => svc.grows.updatePhoto(grow.id, photo.id, { caption: caption.trim() }), { title: "Bildunterschrift gespeichert", icon: "Save" })}><Icon name="Save" size={16} /> Speichern</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Messwerte ------------------------------ */

/** „6,5“ → 6.5; leer → `null`; Unsinn oder außerhalb → `NaN`. */
export function parseDecimal(text: string, min: number, max: number): number | null {
  const clean = text.trim().replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= min && value <= max ? value : Number.NaN;
}

const show = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export function EnvModal({ grow, initialDate, open, onClose, onSaved }: { grow: Grow; initialDate?: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const svc = useServices();
  const [date, setDate] = useState(initialDate ?? todayLocal());
  const existing = (d: string): EnvPoint | undefined => grow.env.find((e) => e.date === d);
  const [temp, setTemp] = useState(show(existing(date)?.temp));
  const [rh, setRh] = useState(show(existing(date)?.rh));
  const [ec, setEc] = useState(show(existing(date)?.ec));
  const [ph, setPh] = useState(show(existing(date)?.ph));
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, error, run } = useGrowAction(() => onSaved());
  const start = grow.startDate.slice(0, 10);
  const current = existing(date);

  /** Beim Datumswechsel die Werte dieses Tages vorbelegen (erneutes Speichern überschreibt). */
  const changeDate = (value: string) => {
    setDate(value);
    const found = existing(value);
    setTemp(show(found?.temp)); setRh(show(found?.rh)); setEc(show(found?.ec)); setPh(show(found?.ph));
    setConfirmDelete(false);
  };

  const values = { temp: parseDecimal(temp, -10, 60), rh: parseDecimal(rh, 0, 100), ec: parseDecimal(ec, 0, 10), ph: parseDecimal(ph, 0, 14) };
  const invalid = (Object.entries(values) as [string, number | null][]).find(([, v]) => Number.isNaN(v));
  const labels: Record<string, string> = { temp: "Temperatur (−10 bis 60 °C)", rh: "Luftfeuchte (0 bis 100 %)", ec: "EC (0 bis 10 mS)", ph: "pH (0 bis 14)" };
  const problem =
    !date ? "Bitte ein Datum angeben." :
    date < start ? "Das Datum liegt vor dem Start des Grows." :
    date > todayLocal() ? "Das Datum liegt in der Zukunft." :
    invalid ? `Ungültiger Wert: ${labels[invalid[0]]}.` :
    Object.values(values).every((v) => v === null) ? "Bitte mindestens einen Wert eintragen." : "";
  const vpd = values.temp != null && values.rh != null && !Number.isNaN(values.temp) && !Number.isNaN(values.rh) ? vpdKpa(values.temp, values.rh, grow.leafOffset) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    void run(async () => { await svc.grows.saveEnv(grow.id, { date, temp: values.temp, rh: values.rh, ec: values.ec, ph: values.ph }); }, { title: current ? "Messwerte aktualisiert" : "Messwerte gespeichert", desc: formatDay(date), icon: "Thermometer" });
  };

  return (
    <Modal open={open} onClose={onClose} title={current ? "Messwerte bearbeiten" : "Messwerte eintragen"} size="md">
      <form noValidate onSubmit={submit} className="space-y-4" data-testid="env-form">
        <Field label="Datum" hint={date >= start && date <= todayLocal() ? (current ? `Tag ${dayDiff(start, date)} · für diesen Tag gibt es schon Werte, sie werden überschrieben` : `Tag ${dayDiff(start, date)}`) : undefined}>
          <Input type="date" aria-label="Datum" value={date} min={start} max={todayLocal()} onChange={(e) => changeDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Temperatur (°C)"><Input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="z. B. 24,5" aria-label="Temperatur" /></Field>
          <Field label="Luftfeuchte (%)"><Input inputMode="decimal" value={rh} onChange={(e) => setRh(e.target.value)} placeholder="z. B. 55" aria-label="Luftfeuchte" /></Field>
          <Field label="EC (mS)"><Input inputMode="decimal" value={ec} onChange={(e) => setEc(e.target.value)} placeholder="z. B. 1,4" aria-label="EC" /></Field>
          <Field label="pH"><Input inputMode="decimal" value={ph} onChange={(e) => setPh(e.target.value)} placeholder="z. B. 6,3" aria-label="pH" /></Field>
        </div>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg-muted" data-testid="env-vpd">
          {vpd !== null ? <>VPD: <strong className="tnum text-fg">{vpd.toLocaleString("de-DE", { minimumFractionDigits: 2 })} kPa</strong> <span className="text-xs text-fg-subtle">(Blatt-Abzug {String(grow.leafOffset).replace(".", ",")} °C)</span></> : "VPD wird berechnet, sobald Temperatur und Luftfeuchte eingetragen sind."}
        </p>
        <p className="text-xs text-fg-subtle">Alle Felder sind optional – leere Werte bleiben leer. Pro Tag gibt es einen Eintrag.</p>
        {touched && <ErrorLine error={problem} />}
        <ErrorLine error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {current ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="danger" loading={busy} onClick={() => void run(() => svc.grows.deleteEnv(grow.id, date), { title: "Messwerte gelöscht", desc: formatDay(date), icon: "Trash2" })} data-testid="confirm-delete-env"><Icon name="Trash2" size={16} /> Wirklich löschen</Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Nein</Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-env"><Icon name="Trash2" size={16} /> Tag löschen</Button>
            )
          ) : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" loading={busy}><Icon name="Save" size={16} /> Speichern</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
