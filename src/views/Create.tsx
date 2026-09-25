import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav, type ViewKey } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Segmented, Select, Textarea } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import { invalidate, useGrows, useWikiCategories } from "@/data/hooks";
import { useFeatures } from "@/config/FeatureContext";
import { createKinds, type CreateKind } from "@/config/create-kinds";
import type { CreateStrainInput, GrowLog, TaskPriority } from "@/types";
import { toneSoft } from "@/lib/tokens";

/**
 * Unterseiten der Schnellaktionen (FAB, Dashboard, Grows, Sorten, Wiki).
 * Aufruf: navigate("create", { kind: "grow" | "log" | "strain" | "task" | "wiki", growId? }).
 */
const isKind = (k: string | undefined): k is CreateKind => !!k && k in createKinds;

export default function Create() {
  const { params, back, navigate } = useNav();
  const { isEnabled } = useFeatures();
  const kind = isKind(params?.kind) ? params.kind : null;

  if (!kind) {
    return (
      <div className="space-y-6">
        <PageHeader title="Neu erstellen" subtitle="Was möchtest du anlegen?" icon="Plus" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(createKinds) as CreateKind[]).filter((k) => isEnabled(createKinds[k].feature)).map((k) => (
            <button key={k} onClick={() => navigate("create", { kind: k })} className="card card-hover flex items-center gap-3 p-4 text-left">
              <span className={cn("grid size-11 place-items-center rounded-xl", toneSoft[createKinds[k].tone])}><Icon name={createKinds[k].icon} size={20} /></span>
              <span><span className="block font-semibold">{createKinds[k].title}</span><span className="block text-xs text-fg-subtle">{createKinds[k].subtitle}</span></span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const meta = createKinds[kind];
  if (!isEnabled(meta.feature)) {
    return <EmptyState icon="Lock" title="Noch nicht freigeschaltet" desc="Diese Funktion ist derzeit deaktiviert." action={<Button variant="soft" onClick={() => navigate("dashboard")}>Zum Dashboard</Button>} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button onClick={back} className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Zurück
      </button>
      <PageHeader title={meta.title} subtitle={meta.subtitle} icon={meta.icon} breadcrumb={["Schnellaktion", meta.title]} />
      <Card className="p-4 sm:p-6">
        {kind === "grow" && <GrowForm key="grow" />}
        {kind === "log" && <LogForm key={`log-${params?.growId ?? ""}`} presetGrowId={params?.growId} />}
        {kind === "strain" && <StrainForm key="strain" />}
        {kind === "task" && <TaskForm key="task" />}
        {kind === "wiki" && <WikiForm key="wiki" />}
      </Card>
    </div>
  );
}

/* ------------------------------ Shared ------------------------------ */

function useSubmit() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.push({ title: "Speichern fehlgeschlagen", desc: err instanceof Error ? err.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function FormActions({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  const { back } = useNav();
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" onClick={back}>Abbrechen</Button>
      <Button type="submit" loading={busy} disabled={disabled}><Icon name="Save" size={16} /> {label}</Button>
    </div>
  );
}

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}
    >
      {children}
    </form>
  );
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="text-xs font-medium text-danger">{children}</p>;
}

function done(toast: ReturnType<typeof useToast>, navigate: (v: ViewKey, p?: Record<string, string>) => void, title: string, desc: string, icon: string, to: ViewKey, p?: Record<string, string>) {
  toast.push({ title, desc, tone: "leaf", icon });
  navigate(to, p);
}

/* ------------------------------ Grow ------------------------------ */

const mediums = ["Living Soil (No-Till)", "Erde (Bio)", "Kokos/Perlit 70/30", "Hydro / DWC"];

function GrowForm() {
  const svc = useServices();
  const toast = useToast();
  const { navigate } = useNav();
  const { busy, run } = useSubmit();
  const [name, setName] = useState("");
  const [strain, setStrain] = useState("");
  const [breeder, setBreeder] = useState("");
  const [medium, setMedium] = useState(mediums[0]);
  const [touched, setTouched] = useState(false);
  const errors = { name: !name.trim() ? "Bitte einen Namen angeben." : "", strain: !strain.trim() ? "Bitte eine Sorte angeben." : "" };
  const valid = !errors.name && !errors.strain;

  return (
    <Form onSubmit={() => {
      setTouched(true);
      if (!valid) return;
      void run(async () => {
        const grow = await svc.grows.create({ name: name.trim(), strain: strain.trim(), breeder: breeder.trim() || "Unbekannt", medium });
        invalidate("grows");
        done(toast, navigate, "Grow angelegt", grow.name, "Sprout", "grows", { growId: grow.id });
      });
    }}>
      <Field label="Name des Grows"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Northern Haze · Run 04" autoFocus aria-invalid={touched && !!errors.name} /></Field>
      {touched && <ErrorText>{errors.name}</ErrorText>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Field label="Sorte"><Input value={strain} onChange={(e) => setStrain(e.target.value)} placeholder="z. B. Gorilla Glue #4" aria-invalid={touched && !!errors.strain} /></Field>
          {touched && <ErrorText>{errors.strain}</ErrorText>}
        </div>
        <Field label="Breeder" hint="optional"><Input value={breeder} onChange={(e) => setBreeder(e.target.value)} placeholder="z. B. Dutch Passion" /></Field>
      </div>
      <Field label="Medium">
        <Select value={medium} onChange={(e) => setMedium(e.target.value)}>{mediums.map((m) => <option key={m}>{m}</option>)}</Select>
      </Field>
      <FormActions busy={busy} label="Grow anlegen" />
    </Form>
  );
}

/* ------------------------------ Log ------------------------------ */

const logTags: GrowLog["tag"][] = ["Gießen", "Dünger", "Training", "Beobachtung", "Schädling", "Ernte"];

function LogForm({ presetGrowId }: { presetGrowId?: string }) {
  const svc = useServices();
  const toast = useToast();
  const { navigate } = useNav();
  const { grows, loading } = useGrows();
  const { busy, run } = useSubmit();
  const [growId, setGrowId] = useState(presetGrowId ?? "");
  const [tag, setTag] = useState<GrowLog["tag"]>("Beobachtung");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const selectedGrow = grows.find((g) => g.id === (growId || grows[0]?.id));
  const errors = { grow: !selectedGrow ? "Bitte zuerst einen Grow anlegen." : "", title: !title.trim() ? "Bitte einen Titel angeben." : "" };

  if (!loading && grows.length === 0) {
    return <EmptyState icon="Sprout" title="Noch kein Grow" desc="Ein Log-Eintrag gehört immer zu einem Grow." action={<Button onClick={() => navigate("create", { kind: "grow" })}>Grow anlegen</Button>} />;
  }

  return (
    <Form onSubmit={() => {
      setTouched(true);
      if (errors.grow || errors.title || !selectedGrow) return;
      void run(async () => {
        await svc.grows.addLog(selectedGrow.id, { day: selectedGrow.day, date: new Date().toISOString().slice(0, 10), title: title.trim(), text: text.trim(), tag });
        done(toast, navigate, "Log gespeichert", `${selectedGrow.name} · Tag ${selectedGrow.day}`, "NotebookPen", "grows", { growId: selectedGrow.id });
      });
    }}>
      <Field label="Grow">
        <Select value={selectedGrow?.id ?? ""} onChange={(e) => setGrowId(e.target.value)} disabled={loading}>
          {grows.map((g) => <option key={g.id} value={g.id}>{g.name} · Tag {g.day}</option>)}
        </Select>
      </Field>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Kategorie</span>
        <div className="flex flex-wrap gap-2">
          {logTags.map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)} aria-pressed={tag === t} className={cn("min-h-10 rounded-full border px-3.5 text-sm transition", tag === t ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}>{t}</button>
          ))}
        </div>
      </div>
      <Field label="Titel"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. 2 L Komposttee, pH 6.4" autoFocus aria-invalid={touched && !!errors.title} /></Field>
      {touched && <ErrorText>{errors.title || errors.grow}</ErrorText>}
      <Field label="Notiz" hint="optional"><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Beobachtungen, Werte, nächste Schritte …" /></Field>
      <FormActions busy={busy} label="Eintrag speichern" />
    </Form>
  );
}

/* ------------------------------ Strain ------------------------------ */

function StrainForm() {
  const svc = useServices();
  const toast = useToast();
  const { navigate } = useNav();
  const { busy, run } = useSubmit();
  const [f, setF] = useState<CreateStrainInput>({ name: "", breeder: "", type: "Hybrid", thc: 20, cbd: 0.5, flowering: 9, yield: "400–500 g/m²", difficulty: 2, price: 30, notes: "", effects: [] });
  const [effects, setEffects] = useState("");
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof CreateStrainInput>(k: K, v: CreateStrainInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));
  const errors = {
    name: !f.name.trim() ? "Bitte einen Namen angeben." : "",
    breeder: !f.breeder.trim() ? "Bitte den Breeder angeben." : "",
    values: f.thc < 0 || f.thc > 40 || f.cbd < 0 || f.cbd > 30 || f.flowering < 4 || f.flowering > 20 ? "THC 0–40 %, CBD 0–30 %, Blüte 4–20 Wochen." : "",
  };

  return (
    <Form onSubmit={() => {
      setTouched(true);
      if (errors.name || errors.breeder || errors.values) return;
      void run(async () => {
        const s = await svc.strains.create({ ...f, name: f.name.trim(), breeder: f.breeder.trim(), notes: f.notes.trim(), effects: effects.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 6) });
        done(toast, navigate, "Sorte hinzugefügt", `${s.name} · ${s.breeder}`, "Leaf", "strains");
      });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Lemon Haze" autoFocus aria-invalid={touched && !!errors.name} /></Field>
        <Field label="Breeder"><Input value={f.breeder} onChange={(e) => set("breeder", e.target.value)} placeholder="z. B. Green House Seeds" aria-invalid={touched && !!errors.breeder} /></Field>
      </div>
      {touched && <ErrorText>{errors.name || errors.breeder}</ErrorText>}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Typ</span>
        <Segmented value={f.type} onChange={(v) => set("type", v)} options={[{ value: "Sativa", label: "Sativa" }, { value: "Indica", label: "Indica" }, { value: "Hybrid", label: "Hybrid" }]} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="THC %"><Input inputMode="decimal" value={String(f.thc)} onChange={(e) => set("thc", num(e.target.value))} /></Field>
        <Field label="CBD %"><Input inputMode="decimal" value={String(f.cbd)} onChange={(e) => set("cbd", num(e.target.value))} /></Field>
        <Field label="Blüte (Wo.)"><Input inputMode="numeric" value={String(f.flowering)} onChange={(e) => set("flowering", Math.round(num(e.target.value)))} /></Field>
        <Field label="Preis €"><Input inputMode="decimal" value={String(f.price)} onChange={(e) => set("price", num(e.target.value))} /></Field>
      </div>
      {touched && <ErrorText>{errors.values}</ErrorText>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ertrag"><Input value={f.yield} onChange={(e) => set("yield", e.target.value)} /></Field>
        <Field label="Schwierigkeit">
          <Select value={String(f.difficulty)} onChange={(e) => set("difficulty", Number(e.target.value) as 1 | 2 | 3)}>
            <option value="1">Einfach</option><option value="2">Mittel</option><option value="3">Anspruchsvoll</option>
          </Select>
        </Field>
      </div>
      <Field label="Effekte" hint="kommagetrennt"><Input value={effects} onChange={(e) => setEffects(e.target.value)} placeholder="Euphorisch, Kreativ, Entspannt" /></Field>
      <Field label="Notizen" hint="optional"><Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Aroma, Wuchs, Erfahrungen …" /></Field>
      <FormActions busy={busy} label="Sorte speichern" />
    </Form>
  );
}

/* ------------------------------ Task ------------------------------ */

const whenPresets = ["Heute", "Heute · 20:00", "Morgen", "In 3 Tagen", "Nächste Woche"];

function TaskForm() {
  const svc = useServices();
  const toast = useToast();
  const { navigate } = useNav();
  const { grows } = useGrows();
  const { busy, run } = useSubmit();
  const [title, setTitle] = useState("");
  const [grow, setGrow] = useState("");
  const [when, setWhen] = useState(whenPresets[0]);
  const [prio, setPrio] = useState<TaskPriority>("mittel");
  const [touched, setTouched] = useState(false);
  const error = !title.trim() ? "Bitte beschreibe die Aufgabe." : "";

  return (
    <Form onSubmit={() => {
      setTouched(true);
      if (error) return;
      void run(async () => {
        await svc.tasks.create({ title: title.trim(), grow: grow || "Allgemein", when, prio });
        done(toast, navigate, "Task angelegt", `${title.trim()} · ${when}`, "ListChecks", "dashboard");
      });
    }}>
      <Field label="Aufgabe"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Komposttee ansetzen" autoFocus aria-invalid={touched && !!error} /></Field>
      {touched && <ErrorText>{error}</ErrorText>}
      <Field label="Grow" hint="optional">
        <Select value={grow} onChange={(e) => setGrow(e.target.value)}>
          <option value="">Allgemein</option>
          {grows.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
        </Select>
      </Field>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Fällig</span>
        <div className="flex flex-wrap gap-2">
          {whenPresets.map((w) => (
            <button key={w} type="button" onClick={() => setWhen(w)} aria-pressed={when === w} className={cn("min-h-10 rounded-full border px-3.5 text-sm transition", when === w ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}>{w}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Priorität</span>
        <Segmented value={prio} onChange={setPrio} options={[{ value: "niedrig", label: "Niedrig" }, { value: "mittel", label: "Mittel" }, { value: "hoch", label: "Hoch" }]} />
      </div>
      <FormActions busy={busy} label="Task anlegen" />
    </Form>
  );
}

/* ------------------------------ Wiki ------------------------------ */

function WikiForm() {
  const svc = useServices();
  const toast = useToast();
  const { navigate } = useNav();
  const { categories } = useWikiCategories();
  const { busy, run } = useSubmit();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [touched, setTouched] = useState(false);
  const cats = useMemo(() => categories.filter((c) => c !== "Übersicht"), [categories]);
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const errors = {
    title: title.trim().length < 4 ? "Titel: mindestens 4 Zeichen." : "",
    body: paragraphs.join(" ").length < 40 ? "Inhalt: mindestens 40 Zeichen." : "",
  };

  return (
    <Form onSubmit={() => {
      setTouched(true);
      if (errors.title || errors.body) return;
      void run(async () => {
        const a = await svc.wiki.create({
          title: title.trim(),
          category: category || cats[0] || "Übersicht",
          excerpt: excerpt.trim() || paragraphs[0].slice(0, 140),
          body: paragraphs,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
        });
        done(toast, navigate, "Artikel veröffentlicht", `${a.title} · Entwurf v0.1`, "BookOpen", "wiki", { articleId: a.id });
      });
    }}>
      <Field label="Titel"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. VPD in der Blüte richtig steuern" autoFocus aria-invalid={touched && !!errors.title} /></Field>
      {touched && <ErrorText>{errors.title}</ErrorText>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategorie">
          <Select value={category || cats[0] || ""} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Tags" hint="kommagetrennt"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VPD, Klima, Blüte" /></Field>
      </div>
      <Field label="Kurzbeschreibung" hint="optional"><Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Ein Satz, worum es geht" /></Field>
      <Field label="Inhalt" hint="Absätze mit Leerzeile trennen"><Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Einleitung …\n\nAbschnitt 2 …"} aria-invalid={touched && !!errors.body} /></Field>
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <span>{paragraphs.length} Absätze · ~{Math.max(1, Math.round(paragraphs.join(" ").split(/\s+/).filter(Boolean).length / 200))} Min. Lesezeit</span>
        <Badge tone="info">Entwurf v0.1</Badge>
      </div>
      {touched && <ErrorText>{errors.body}</ErrorText>}
      <FormActions busy={busy} label="Veröffentlichen" />
    </Form>
  );
}
