import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { Button, Chip, Field, IconButton, Input, Modal } from "@/components/ui";
import { StrainListEditor } from "@/components/StrainListEditor";
import { restoreScroll, usePrefersReducedMotion } from "@/lib/hooks";
import { GROW_MEDIUMS, GROW_TYPES, GROW_VISIBILITIES, visibilityHint, visibilityLabel } from "@/lib/grows";
import { totalPlants } from "@/lib/grow-strains";
import {
  LAST_STEP, MEDIUM_INFO, TYPE_INFO, VISIBILITY_INFO, WIZARD_STEPS, draftStrains, firstInvalidStep, isDraftDirty, newDraft,
  startDateError, startLabel, startPresets, startPreview, stepError, strainStepError, toCreateInput, type WizardDraft,
} from "@/lib/grow-wizard";
import type { CreateGrowInput } from "@/types";

/**
 * B-102: „Neuer Grow“ als Wizard (Name & Sorten → Anbau → Start & Sichtbarkeit → Übersicht).
 * Mobil zuerst: große Antippflächen, feste Leiste mit „Zurück“/„Weiter“ über der Tab-Leiste, nur ein Thema pro Schritt.
 */
export function GrowWizard({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (input: CreateGrowInput) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<WizardDraft>(newDraft);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const reduced = usePrefersReducedMotion();
  const first = useRef(true);
  const set = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const error = stepError(step, draft);
  const strainError = strainStepError(draft.strains);
  const nameMissing = step === 0 && !draft.name.trim();
  const last = step === LAST_STEP;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    restoreScroll(0);
  }, [step]);

  const goto = (next: number) => { setStep(next); setReached((r) => Math.max(r, next)); };
  const cancel = () => (isDraftDirty(draft) ? setConfirmCancel(true) : onCancel());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!last) { if (!error) goto(step + 1); return; }
    const bad = firstInvalidStep(draft);
    if (bad >= 0) { goto(bad); return; }
    onSubmit(toCreateInput(draft));
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex max-w-xl flex-col gap-4" data-testid="grow-wizard">
      <header className="space-y-3">
        <div className="flex items-center gap-1">
          {step > 0 && <IconButton type="button" label="Zurück" className="-ml-2" onClick={() => goto(step - 1)}><ArrowLeft className="size-5" /></IconButton>}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-fg-subtle" data-testid="wizard-progress">Neuer Grow · Schritt {step + 1} von {WIZARD_STEPS.length}</p>
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{WIZARD_STEPS[step].title}</h1>
          </div>
          <IconButton type="button" label="Abbrechen" className="-mr-2" onClick={cancel} data-testid="wizard-cancel"><X className="size-5" /></IconButton>
        </div>
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Fortschritt">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                disabled={i > reached || (i > step && !!stepError(step, draft))}
                onClick={() => goto(i)}
                aria-label={`Schritt ${i + 1}: ${s.title}`}
                aria-current={i === step ? "step" : undefined}
                className="group flex min-h-9 w-full flex-col justify-end gap-1.5 disabled:cursor-default"
              >
                <span className={cn("block h-1.5 w-full rounded-full transition-colors", i <= step ? "bg-accent" : i <= reached ? "bg-accent/40" : "bg-surface-3")} />
                <span className={cn("truncate text-left text-[11px] font-medium", i === step ? "text-fg" : "text-fg-subtle")}>{s.short}</span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <motion.section
        key={step}
        initial={reduced ? false : { opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18 }}
        className="card space-y-5 p-4 sm:p-6"
        data-testid={`wizard-step-${WIZARD_STEPS[step].key}`}
      >
        {step === 0 && (
          <>
            <Intro>Gib deinem Grow einen Namen. Sorten kannst du jetzt eintragen oder später ergänzen.</Intro>
            <Field label="Name des Grows">
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={100} placeholder="z. B. Northern Haze · Run 04" autoFocus autoComplete="off" enterKeyHint="next" />
            </Field>
            <StrainListEditor value={draft.strains} onChange={(list) => set("strains", list)} error={strainError || undefined} />
          </>
        )}
        {step === 1 && (
          <>
            <Intro>Wie und was wächst? Das hilft bei Richtwerten und im Tagebuch – ändern kannst du es jederzeit.</Intro>
            <Group label="Medium">
              <div role="radiogroup" aria-label="Medium" className="grid grid-cols-2 gap-2.5">
                {GROW_MEDIUMS.map((m) => (
                  <Tile key={m} selected={draft.medium === m} icon={MEDIUM_INFO[m]?.icon ?? "Sprout"} label={m} hint={MEDIUM_INFO[m]?.hint} onSelect={() => set("medium", m)} stacked />
                ))}
              </div>
            </Group>
            <Group label="Typ">
              <div role="radiogroup" aria-label="Typ" className="grid gap-2.5">
                {GROW_TYPES.map((t) => (
                  <Tile key={t} selected={draft.type === t} label={t} hint={TYPE_INFO[t]} onSelect={() => set("type", t)} />
                ))}
              </div>
            </Group>
          </>
        )}
        {step === 2 && (
          <>
            <Intro>Wann ging es los? Auch rückwirkend – der Tag des Grows wird daraus berechnet.</Intro>
            <Group label="Start">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Schnellwahl für den Start">
                {startPresets().map((p) => (
                  <Chip key={p.label} type="button" active={draft.startDate === p.value} aria-pressed={draft.startDate === p.value} className="min-h-11 px-4 text-sm" onClick={() => set("startDate", p.value)}>{p.label}</Chip>
                ))}
              </div>
              <Field label="Startdatum">
                <Input type="date" value={draft.startDate} max={startPresets()[0].value} min="2000-01-01" onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!startDateError(draft.startDate)} />
              </Field>
              {startDateError(draft.startDate)
                ? <p role="alert" className="text-xs font-medium text-danger">{startDateError(draft.startDate)}</p>
                : <p className="text-xs text-fg-subtle" data-testid="wizard-start-preview">{startPreview(draft.startDate)}</p>}
            </Group>
            <Group label="Sichtbar für">
              <div role="radiogroup" aria-label="Sichtbar für" className="grid gap-2.5">
                {GROW_VISIBILITIES.map((v) => (
                  <Tile key={v} selected={draft.visibility === v} icon={VISIBILITY_INFO[v].icon} label={visibilityLabel[v]} hint={VISIBILITY_INFO[v].hint} onSelect={() => set("visibility", v)} />
                ))}
              </div>
              <p className="text-xs text-fg-subtle">{visibilityHint[draft.visibility]}</p>
            </Group>
          </>
        )}
        {step === LAST_STEP && <Review draft={draft} onEdit={goto} />}
      </motion.section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-3.5 border-t border-border bg-surface/90 px-3.5 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3" data-testid="wizard-bar">
        {nameMissing && <p className="mb-2 text-center text-xs text-fg-subtle" data-testid="wizard-hint">Gib deinem Grow einen Namen, dann geht es weiter.</p>}
        <div className="flex gap-2.5">
          {step > 0 && <Button type="button" variant="secondary" className="min-h-12 px-5" onClick={() => goto(step - 1)}>Zurück</Button>}
          {last
            ? <Button type="submit" className="min-h-12 flex-1" loading={busy}><Icon name="Sprout" size={18} /> Grow anlegen</Button>
            : <Button type="submit" className="min-h-12 flex-1" disabled={!!error}>Weiter <ArrowRight className="size-4" /></Button>}
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Eingaben verwerfen?"
        size="sm"
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onCancel}>Verwerfen</Button><Button type="button" onClick={() => setConfirmCancel(false)}>Weiter bearbeiten</Button></div>}
      >
        <p className="text-sm text-fg-muted">Dein neuer Grow wurde noch nicht angelegt. Wenn du abbrichst, gehen die Eingaben verloren.</p>
      </Modal>
    </form>
  );
}

const Intro = ({ children }: { children: ReactNode }) => <p className="text-sm text-fg-muted">{children}</p>;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2.5"><h2 className="text-sm font-semibold text-fg">{label}</h2>{children}</div>;
}

/** Große Auswahlfläche (Radio-Verhalten). `stacked`: Symbol über dem Text (Raster), sonst Symbol links neben dem Text. */
function Tile({ selected, icon, label, hint, onSelect, stacked }: { selected: boolean; icon?: string; label: string; hint?: string; onSelect: () => void; stacked?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid="wizard-tile"
      className={cn(
        "relative flex min-h-[4.25rem] gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        stacked ? "flex-col" : "items-center",
        selected ? "border-accent bg-accent/10" : "border-border bg-surface-2/50 hover:bg-surface-2"
      )}
    >
      {icon && <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", selected ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-muted")}><Icon name={icon} size={18} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">{hint}</span>}
      </span>
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", stacked && "absolute right-3 top-3", selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong text-transparent")} aria-hidden><Check className="size-3" strokeWidth={3} /></span>
    </button>
  );
}

function Review({ draft, onEdit }: { draft: WizardDraft; onEdit: (step: number) => void }) {
  const strains = draftStrains(draft.strains);
  const plants = totalPlants(strains);
  const rows: { label: string; step: number; value: ReactNode }[] = [
    { label: "Name", step: 0, value: draft.name.trim() },
    {
      label: strains.length > 1 ? `Sorten (${strains.length})` : "Sorte",
      step: 0,
      value: strains.length === 0
        ? <span className="font-normal text-fg-subtle">Keine Sorte angegeben</span>
        : <ul className="space-y-0.5">{strains.map((s, i) => <li key={i}>{s.name}{s.breeder && <span className="font-normal text-fg-subtle"> · {s.breeder}</span>}{s.plants !== null && <span className="font-normal text-fg-subtle"> · {s.plants} {s.plants === 1 ? "Pflanze" : "Pflanzen"}</span>}</li>)}{strains.length > 1 && plants !== null && <li className="text-xs font-normal text-fg-subtle">{plants} Pflanzen insgesamt</li>}</ul>,
    },
    { label: "Medium", step: 1, value: draft.medium },
    { label: "Typ", step: 1, value: draft.type },
    { label: "Start", step: 2, value: <>{startLabel(draft.startDate)}<span className="block text-xs font-normal text-fg-subtle">{startPreview(draft.startDate)}</span></> },
    { label: "Sichtbar für", step: 2, value: <>{visibilityLabel[draft.visibility]}<span className="block text-xs font-normal text-fg-subtle">{VISIBILITY_INFO[draft.visibility].hint}</span></> },
  ];
  return (
    <>
      <Intro>Alles richtig? Mit „Ändern“ springst du zum jeweiligen Schritt zurück.</Intro>
      <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border" data-testid="wizard-review">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2 py-1.5 pl-3.5 pr-1.5">
            <div className="min-w-0 flex-1 py-1.5">
              <dt className="text-xs text-fg-subtle">{r.label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium">{r.value}</dd>
            </div>
            <button type="button" onClick={() => onEdit(r.step)} aria-label={`${r.label} ändern`} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-accent transition hover:bg-accent/10">Ändern</button>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-subtle">Danach kannst du Tagebuch, Messwerte und Fotos ergänzen. Alles lässt sich später im Grow bearbeiten.</p>
    </>
  );
}
