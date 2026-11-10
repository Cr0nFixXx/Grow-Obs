import { useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useServices } from "@/data/DataContext";
import { StrainListEditor } from "@/components/StrainListEditor";
import { cleanStrains, emptyStrain, growStrains, strainListError } from "@/lib/grow-strains";
import { GROW_MEDIUMS, GROW_TYPES, formatGrams, GROW_VISIBILITIES, TARGET_KEYS, TARGET_META, conditionLabel, visibilityHint, visibilityLabel, dayDiff, effectiveTargets, formatDay, formatRange, todayLocal, vpdKpa } from "@/lib/grows";
import { resolveMedia } from "@/lib/media";
import type { EnvPoint, FinishGrowInput, Grow, GrowCondition, GrowLog, GrowPhoto, GrowStrain, GrowVisibility, TargetKey, TargetRange, UpdateGrowInput } from "@/types";

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

/** Zielbereich aus zwei Textfeldern: beide leer = `null`, sonst `{min, max}`; `string` = Fehlertext. */
export function parseTargetRange(minText: string, maxText: string, label: string, lo: number, hi: number): { min: number; max: number } | null | string {
  const a = minText.trim().replace(",", ".");
  const b = maxText.trim().replace(",", ".");
  if (!a && !b) return null;
  if (!a || !b) return `${label}: bitte Minimum und Maximum angeben – oder beide leer lassen.`;
  const min = Number(a);
  const max = Number(b);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < lo || max > hi || min > hi || max < lo) return `${label}: Werte zwischen ${lo} und ${hi}.`;
  if (min >= max) return `${label}: Minimum muss kleiner als das Maximum sein.`;
  return { min, max };
}
const toField = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));

/** Zielbereich je Größe im Formular (B-88): Richtwert der Phase, eigener Bereich oder kein Ziel. */
type TargetMode = "default" | "custom" | "off";
interface TargetFieldState { mode: TargetMode; min: string; max: string }
const targetFieldOf = (v: TargetRange | null | undefined): TargetFieldState =>
  v === undefined ? { mode: "default", min: "", max: "" } : v === null ? { mode: "off", min: "", max: "" } : { mode: "custom", min: toField(v.min), max: toField(v.max) };
/** `"default"`, `null`, `{min, max}` oder ein Fehlertext. */
function targetPatchOf(key: TargetKey, f: TargetFieldState): TargetRange | null | "default" | string {
  if (f.mode === "default") return "default";
  if (f.mode === "off") return null;
  const { label, lo, hi } = TARGET_META[key];
  const parsed = parseTargetRange(f.min, f.max, label, lo, hi);
  return parsed === null ? `${label}: bitte Minimum und Maximum angeben.` : parsed;
}

/* ------------------------------ Bearbeiten ------------------------------ */

export function EditGrowModal({ grow, open, onClose, onSaved }: { grow: Grow; open: boolean; onClose: () => void; onSaved: (grow: Grow) => void }) {
  const svc = useServices();
  const [name, setName] = useState(grow.name);
  const [strainList, setStrainList] = useState<GrowStrain[]>(() => { const l = growStrains(grow); return l.length ? l : [emptyStrain()]; });
  const [type, setType] = useState(grow.type);
  const [medium, setMedium] = useState(grow.medium);
  const [startDate, setStartDate] = useState(grow.startDate.slice(0, 10));
  const [totalDays, setTotalDays] = useState(String(grow.totalDays));
  const [expectedYield, setExpectedYield] = useState(grow.expectedYield === "—" ? "" : grow.expectedYield);
  const [leafOffset, setLeafOffset] = useState(String(grow.leafOffset).replace(".", ","));
  const [visibility, setVisibility] = useState<GrowVisibility>(grow.visibility ?? "private");
  const [targetFields, setTargetFields] = useState<Record<TargetKey, TargetFieldState>>(() => Object.fromEntries(TARGET_KEYS.map((k) => [k, targetFieldOf(grow.targets[k])])) as Record<TargetKey, TargetFieldState>);
  const setTargetField = (key: TargetKey, patch: Partial<TargetFieldState>) => setTargetFields((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  const phaseDefaults = effectiveTargets(grow.phase, {});
  const { busy, error, run } = useGrowAction((g) => g && onSaved(g));
  const [touched, setTouched] = useState(false);

  const targetPatches = Object.fromEntries(TARGET_KEYS.map((k) => [k, targetPatchOf(k, targetFields[k])])) as Record<TargetKey, ReturnType<typeof targetPatchOf>>;
  const targetProblem = TARGET_KEYS.map((k) => targetPatches[k]).find((v): v is string => typeof v === "string" && v !== "default") ?? "";
  const days = Number(totalDays);
  const offset = Number(leafOffset.trim().replace(",", ".") || Number.NaN);
  const problems = {
    name: name.trim() ? "" : "Bitte einen Namen angeben.",
    strain: strainListError(strainList),
    startDate: startDate && startDate <= todayLocal() ? "" : "Startdatum darf nicht in der Zukunft liegen.",
    totalDays: Number.isInteger(days) && days >= 14 && days <= 400 ? "" : "Zwischen 14 und 400 Tagen.",
    leafOffset: Number.isFinite(offset) && offset >= 0 && offset <= 6 ? "" : "Blatt-Abzug zwischen 0 und 6 °C.",
    targets: targetProblem,
  };
  const valid = Object.values(problems).every((p) => !p);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const patch: UpdateGrowInput = {
      name: name.trim(), strains: cleanStrains(strainList), type, medium, startDate, totalDays: days,
      expectedYield: expectedYield.trim() || "—", leafOffset: offset, visibility,
      targets: targetPatches as UpdateGrowInput["targets"],
    };
    void run(() => svc.grows.update(grow.id, patch), { title: "Grow gespeichert", desc: patch.name, icon: "Save" });
  };

  return (
    <Modal open={open} onClose={onClose} title="Grow bearbeiten" size="md">
      <form noValidate onSubmit={submit} className="space-y-4" data-testid="edit-grow-form">
        <Field label="Name des Grows"><Input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && !!problems.name} /></Field>
        {touched && <ErrorLine error={problems.name} />}
        <StrainListEditor value={strainList} onChange={setStrainList} error={touched ? problems.strain : undefined} />
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
        <Field label="Sichtbar für" hint={visibilityHint[visibility]}>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as GrowVisibility)} data-testid="grow-visibility">
            {GROW_VISIBILITIES.map((v) => <option key={v} value={v}>{visibilityLabel[v]}</option>)}
          </Select>
        </Field>
        <fieldset className="space-y-3 rounded-xl border border-border p-3" data-testid="target-fields">
          <legend className="px-1 text-[13px] font-semibold">Zielbereiche in den Diagrammen</legend>
          <p className="text-xs text-fg-subtle">Standardmäßig gelten Richtwerte je Phase (Keimung, Vegetativ, Blüte …). Hier kannst du jede Größe für den ganzen Grow überschreiben oder abschalten. Werte außerhalb werden markiert.</p>
          {TARGET_KEYS.map((key) => {
            const meta = TARGET_META[key];
            const f = targetFields[key];
            const base = phaseDefaults[key];
            return (
              <div key={key} className="space-y-2 rounded-lg bg-surface-2/60 p-2.5" data-testid={`target-row-${key}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{meta.label}{meta.unit ? ` (${meta.unit})` : ""}</span>
                  <div className="w-52">
                    <Select value={f.mode} onChange={(e) => setTargetField(key, { mode: e.target.value as TargetMode })} aria-label={`${meta.label}: Zielbereich`}>
                      <option value="default">Richtwert der Phase</option>
                      <option value="custom">Eigener Bereich</option>
                      <option value="off">Kein Ziel</option>
                    </Select>
                  </div>
                </div>
                {f.mode === "default" && <p className="text-xs text-fg-subtle">{base ? `Jetzt (${grow.phase}): ${formatRange(base, meta.unit)}` : `In der Phase ${grow.phase} gibt es dafür keinen Richtwert.`}</p>}
                {f.mode === "custom" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input inputMode="decimal" aria-label={`${meta.label} Minimum`} value={f.min} onChange={(e) => setTargetField(key, { min: e.target.value })} placeholder={base ? toField(base.min) : "von"} aria-invalid={touched && !!problems.targets} />
                    <Input inputMode="decimal" aria-label={`${meta.label} Maximum`} value={f.max} onChange={(e) => setTargetField(key, { max: e.target.value })} placeholder={base ? toField(base.max) : "bis"} aria-invalid={touched && !!problems.targets} />
                  </div>
                )}
              </div>
            );
          })}
          {touched && <ErrorLine error={problems.targets} />}
        </fieldset>
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

  // B-100: bei mehreren Sorten gibt man die Gewichte je Sorte ein, die Summe bildet das Gesamtgewicht.
  const strainList = growStrains(grow);
  const multi = strainList.length > 1;
  const [perStrain, setPerStrain] = useState(() => strainList.map((x) => ({ wet: x.wetG != null ? String(x.wetG) : "", dry: x.dryG != null ? String(x.dryG) : "" })));
  const setPer = (i: number, patch: Partial<{ wet: string; dry: string }>) => setPerStrain((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const parsedPer = perStrain.map((x) => ({ wetG: parseGrams(x.wet), dryG: parseGrams(x.dry) }));
  const perBad = multi && parsedPer.some((x) => Number.isNaN(x.wetG) || Number.isNaN(x.dryG));
  const perOrder = multi && parsedPer.findIndex((x) => x.wetG != null && x.dryG != null && x.dryG > x.wetG);
  const sumOf = (pick: (x: { wetG: number | null; dryG: number | null }) => number | null) => { const v = parsedPer.map(pick).filter((n): n is number => n !== null && !Number.isNaN(n)); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const perAnyFilled = perStrain.some((x) => x.wet.trim() || x.dry.trim());
  const legacyTotals = grow.harvest != null && (grow.harvest.wetG != null || grow.harvest.dryG != null) && !strainList.some((x) => x.wetG != null || x.dryG != null);

  const wetG = parseGrams(wet);
  const dryG = parseGrams(dry);
  const problem =
    !date ? "Bitte ein Datum angeben." :
    date > todayLocal() ? "Das Datum liegt in der Zukunft." :
    date < grow.startDate.slice(0, 10) ? "Das Datum liegt vor dem Start des Grows." :
    harvested && !multi && (Number.isNaN(wetG) || Number.isNaN(dryG)) ? "Gewichte bitte als Zahl in Gramm angeben." :
    harvested && !multi && wetG != null && dryG != null && dryG > wetG ? "Das Trockengewicht kann nicht größer als das Nassgewicht sein." :
    harvested && perBad ? "Gewichte bitte als Zahl in Gramm angeben." :
    harvested && typeof perOrder === "number" && perOrder >= 0 ? `${strainList[perOrder].name}: Das Trockengewicht kann nicht größer als das Nassgewicht sein.` : "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    const input: FinishGrowInput = { outcome, date, note: note.trim(), ...(harvested && !multi ? { wetG, dryG } : {}) };
    // Mehrere Sorten: Gewichte je Sorte; sind alle Felder leer und es gibt nur alte Gesamtgewichte, bleiben diese unverändert.
    if (multi && (harvested ? perAnyFilled || !legacyTotals : true)) input.strainWeights = parsedPer.map((x) => ({ wetG: x.wetG, dryG: x.dryG }));
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
        {harvested && multi && (
          <div className="space-y-3" data-testid="strain-weights">
            <div className="text-sm font-medium text-fg">Gewichte je Sorte <span className="font-normal text-fg-subtle">(optional)</span></div>
            {legacyTotals && !perAnyFilled && <p className="text-xs text-fg-subtle">Bisher nur Gesamtgewichte (nass {formatGrams(grow.harvest?.wetG)}, trocken {formatGrams(grow.harvest?.dryG)}). Trägst du Gewichte je Sorte ein, ersetzen ihre Summen die Gesamtgewichte.</p>}
            {strainList.map((x, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2" data-testid="strain-weight-row">
                <span className="min-w-0 truncate text-sm" title={x.name}>{x.name}</span>
                <Input inputMode="numeric" value={perStrain[i]?.wet ?? ""} onChange={(e) => setPer(i, { wet: e.target.value })} placeholder="nass g" aria-label={`Nassgewicht ${x.name}`} />
                <Input inputMode="numeric" value={perStrain[i]?.dry ?? ""} onChange={(e) => setPer(i, { dry: e.target.value })} placeholder="trocken g" aria-label={`Trockengewicht ${x.name}`} />
              </div>
            ))}
            <p className="text-xs text-fg-muted" data-testid="strain-weights-total">Gesamt: nass {formatGrams(sumOf((x) => x.wetG))}, trocken {formatGrams(sumOf((x) => x.dryG))}</p>
          </div>
        )}
        {harvested && !multi && (
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
