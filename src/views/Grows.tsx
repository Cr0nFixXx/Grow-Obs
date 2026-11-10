import { useState } from "react";
import { Calendar, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, EmptyState, PageHeader, Popover, PopoverItem, ProgressBar, Segmented, SkeletonCard, SmartImage, SwipeLightbox } from "@/components/ui";
import { GrowMeasurements } from "@/components/GrowMeasurements";
import { PhotoCompareModal } from "@/components/PhotoCompare";
import { downloadCsv, logsCsv } from "@/lib/grow-csv";
import { DeleteGrowModal, EditGrowModal, EditLogModal, FinishGrowModal, PhotoModal } from "@/components/GrowDialogs";
import { GROW_PHASE_NAMES, visibilityLabel, conditionIcon, conditionLabel, conditionTone, formatDay, formatGrams, isActiveGrow, statusLabel } from "@/lib/grows";
import { Reveal } from "@/components/motion";
import { type Grow, type GrowCondition, type GrowLog } from "@/types";
import { invalidate, useGrows } from "@/data/hooks";
import { useToast } from "@/components/Toast";
import { useServices } from "@/data/DataContext";
import { ImagePickButton } from "@/components/media";
import { resolveMedia } from "@/lib/media";
import { growStrains, strainSummary, totalPlants } from "@/lib/grow-strains";
import { ALL_STRAINS, matchesStrainFilter, strainNamesOf, strainsWithId } from "@/lib/strain-diary";
import { StrainTags } from "@/components/StrainPicker";
import { toneSoft, type Tone } from "@/lib/tokens";

const logTone: Record<string, Tone> = {
  Gießen: "info", Dünger: "leaf", Training: "soil", Beobachtung: "warning", Schädling: "danger", Ernte: "leaf",
};

export default function Grows() {
  const { params } = useNav();
  const { grows, loading, error, refresh } = useGrows();
  // Filter hier halten: Die Ansicht bleibt bei Hintergrund-Aktualisierungen stehen (kein Skeleton, wenn schon Daten da sind).
  const [filter, setFilter] = useState<GrowFilter>("active");
  if (loading && grows.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }
  if (error) return <EmptyState icon="AlertTriangle" title="Grows nicht geladen" desc={error} />;
  const grow = params?.growId ? grows.find((g) => g.id === params.growId) : null;
  return grow ? <GrowDetail grow={grow} onChanged={refresh} /> : <GrowList grows={grows} filter={filter} onFilter={setFilter} />;
}

type GrowFilter = "active" | "done" | "archive";

const filterMatch: Record<GrowFilter, (g: Grow) => boolean> = {
  active: isActiveGrow,
  done: (g) => g.status !== "active" && !g.archived,
  archive: (g) => g.archived,
};

const filterEmpty: Record<GrowFilter, { title: string; desc: string }> = {
  active: { title: "Kein laufender Grow", desc: "Starte einen neuen Grow oder hole einen aus dem Archiv zurück." },
  done: { title: "Noch nichts abgeschlossen", desc: "Geerntete und abgebrochene Grows erscheinen hier." },
  archive: { title: "Das Archiv ist leer", desc: "Über das Menü eines Grows (⋯) kannst du ihn archivieren." },
};

function GrowList({ grows, filter, onFilter }: { grows: Grow[]; filter: GrowFilter; onFilter: (f: GrowFilter) => void }) {
  const { navigate } = useNav();
  const shown = grows.filter(filterMatch[filter]);
  const count = (f: GrowFilter) => grows.filter(filterMatch[f]).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meine Grows"
        subtitle="Verfolge jeden Anbau – von der Keimung bis zur Ernte."
        icon="Sprout"
        actions={<Button onClick={() => navigate("create", { kind: "grow" })}><Plus className="size-4" /> Neuer Grow</Button>}
      />
      <Segmented<GrowFilter>
        value={filter}
        onChange={onFilter}
        options={[
          { value: "active", label: `Aktiv (${count("active")})` },
          { value: "done", label: `Abgeschlossen (${count("done")})` },
          { value: "archive", label: `Archiv (${count("archive")})` },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((g, i) => (
          <Reveal key={g.id} delay={i * 0.05}>
            <GrowCard g={g} onOpen={() => navigate("grows", { growId: g.id })} />
          </Reveal>
        ))}
        {filter === "active" && (
          <Reveal delay={0.15}>
            <button
              onClick={() => navigate("create", { kind: "grow" })}
              className="card flex h-full min-h-[230px] w-full flex-col items-center justify-center gap-2 border-dashed border-border-strong text-fg-subtle transition hover:border-accent/50 hover:text-accent"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-accent/10"><Plus className="size-6" /></span>
              <span className="font-medium">Neuen Grow starten</span>
              <span className="text-xs">Name, Sorte und Startdatum festlegen</span>
            </button>
          </Reveal>
        )}
      </div>
      {shown.length === 0 && filter !== "active" && <EmptyState icon={filter === "archive" ? "Archive" : "Scissors"} title={filterEmpty[filter].title} desc={filterEmpty[filter].desc} />}
    </div>
  );
}

function GrowCard({ g, onOpen }: { g: Grow; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card card-hover w-full overflow-hidden p-0 text-left">
      <div className="relative h-32">
        <SmartImage src={g.cover} alt={g.strain} className="size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute inset-x-3 bottom-2 flex items-end justify-between text-white">
          <div>
            <div className="text-sm font-semibold">{g.name}</div>
            <div className="text-xs text-white/80" title={g.strain} data-testid="grow-strain">{strainSummary(growStrains(g).map((x) => x.name))}</div>
          </div>
          <Badge tone={g.status === "harvested" ? "leaf" : g.status === "aborted" ? "danger" : g.phase === "Blüte" ? "soil" : "info"}>{g.status === "active" ? g.phase : statusLabel[g.status]}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-1 flex justify-between text-xs text-fg-subtle">
          <span>Tag {g.day}/{g.totalDays}</span>
          <Badge tone={conditionTone[g.condition]}>{conditionLabel[g.condition]}</Badge>
        </div>
        <ProgressBar value={g.progress} />
        <div className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
          <Calendar className="size-3.5" /> {g.medium}
          {g.archived && <Badge className="ml-auto">Archiviert</Badge>}
        </div>
        {g.harvest && (g.harvest.dryG != null || g.harvest.wetG != null) && (
          <div className="mt-2 text-xs text-fg-muted">Ernte: {g.harvest.dryG != null ? `${formatGrams(g.harvest.dryG)} trocken` : `${formatGrams(g.harvest.wetG)} nass`}</div>
        )}
        <div className="mt-3 flex gap-1">
          {g.phases.map((p) => (
            <span key={p.key} className={cn("h-1.5 flex-1 rounded-full", p.done || p.active ? "bg-accent" : "bg-surface-3")} title={p.label} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-fg-subtle">
          {g.phases.map((p) => <span key={p.key} className={cn(p.active && "font-semibold text-fg")}>{p.label}</span>)}
        </div>
      </div>
    </button>
  );
}

function PhaseTimeline({ grow }: { grow: Grow }) {
  return (
    <div>
      <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="GitBranch" size={16} /> Phasen-Verlauf</h2>
      <div className="relative">
        <div className="absolute left-0 right-0 top-3 h-1 rounded-full bg-surface-3" />
        <div className="absolute left-0 top-3 h-1 rounded-full bg-accent" style={{ width: `${grow.progress}%` }} />
        <div className="relative flex justify-between">
          {grow.phases.map((p) => {
            const active = !!p.active;
            return (
              <div key={p.key} className="flex flex-1 flex-col items-center px-1 text-center">
                <span className={cn("grid size-7 place-items-center rounded-full border-2 border-bg text-[10px] font-bold", p.done || active ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-subtle", active && "ring-4 ring-accent/25")}>
                  {p.done ? <Icon name="CheckCircle2" size={13} /> : "•"}
                </span>
                <span className={cn("mt-2 text-xs font-medium", p.done || active ? "text-fg" : "text-fg-subtle")}>{p.label}</span>
                <span className="text-[10px] text-fg-subtle">{p.startedOn ? `ab ${formatDay(p.startedOn)}` : "–"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GrowDetail({ grow, onChanged, readOnly = false, ownerName }: { grow: Grow; onChanged: () => Promise<void> | void; readOnly?: boolean; ownerName?: string }) {
  const svc = useServices();
  const toast = useToast();
  // B-101: Sorten-Filter (nur bei mehreren Sorten); eine entfernte Sorte fällt auf „Alle“ zurück.
  const [strainFilterRaw, setStrainFilter] = useState<string>(ALL_STRAINS);
  const strainChoices = strainsWithId(grow);
  const multi = strainChoices.length > 1;
  const strainFilter = multi && strainChoices.some((x) => x.id === strainFilterRaw) ? strainFilterRaw : ALL_STRAINS;
  const addPhoto = async (path: string) => {
    try {
      // Mit gewählter Sorte gehört das neue Foto zu ihr; bei „Alle“ fragt der Foto-Dialog gleich nach der Sorte.
      const updated = await svc.grows.addPhoto(grow.id, path, strainFilter !== ALL_STRAINS ? [strainFilter] : undefined);
      await onChanged();
      toast.push({ title: "Foto hinzugefügt", desc: strainFilter !== ALL_STRAINS ? `${grow.name} · ${strainChoices.find((x) => x.id === strainFilter)?.name}` : grow.name, tone: "leaf", icon: "Camera" });
      const added = updated?.photos?.[updated.photos.length - 1];
      if (multi && strainFilter === ALL_STRAINS && added) setEditPhotoId(added.id);
    } catch (error) {
      toast.push({ title: "Foto nicht gespeichert", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    }
  };
  const { back, navigate } = useNav();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "edit" | "harvest" | "abort" | "delete">(null);
  const [editLog, setEditLog] = useState<GrowLog | null>(null);
  const [editPhotoId, setEditPhotoId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const exportLogs = () => {
    if (grow.logs.length === 0) { toast.push({ title: "Keine Einträge zum Exportieren", desc: "Schreibe zuerst einen Log-Eintrag.", tone: "warning", icon: "Info" }); return; }
    downloadCsv(grow, "tagebuch", logsCsv(grow));
  };
  const [busy, setBusy] = useState(false);
  const active = grow.status === "active";
  const strainRows = growStrains(grow);
  const plantTotal = totalPlants(strainRows);
  const shownLogs = grow.logs.filter((l) => matchesStrainFilter(l.strainIds, strainFilter));
  const shownPhotos = grow.photos.filter((p) => matchesStrainFilter(p.strainIds, strainFilter));

  /** Aktion ausführen, Liste neu laden, Fehler als Toast zeigen. */
  const act = async (fn: () => Promise<unknown>, success?: { title: string; desc?: string; icon: string }) => {
    setBusy(true);
    try {
      await fn();
      invalidate("grows");
      await onChanged();
      if (success) toast.push({ ...success, tone: "leaf" });
    } catch (error) {
      toast.push({ title: "Aktion fehlgeschlagen", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  const saved = async () => {
    setDialog(null);
    invalidate("grows");
    await onChanged();
  };

  const stats = [
    { label: "Tag", value: `${grow.day}/${grow.totalDays}`, icon: "CalendarDays" },
    { label: "Phase", value: active ? grow.phase : statusLabel[grow.status], icon: "GitBranch" },
    { label: "Erwartet", value: grow.expectedYield, icon: "Trophy" },
    { label: "Zustand", value: conditionLabel[grow.condition], icon: conditionIcon[grow.condition] },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[readOnly ? (ownerName ?? "Mitglied") : "Grows", grow.name]}
        title={grow.name}
        subtitle={[strainSummary(growStrains(grow).map((x) => x.name)), grow.breeder && grow.breeder !== "Unbekannt" ? grow.breeder : "", grow.medium].filter(Boolean).join(" · ")}
        icon="Sprout"
        actions={readOnly ? <Button variant="secondary" onClick={back}>Zurück</Button> : 
          <>
            <Button variant="secondary" onClick={back}>Zurück</Button>
            <Button onClick={() => navigate("create", { kind: "log", growId: grow.id })}>
              <Plus className="size-4" /> Log
            </Button>
            <Popover align="end" label="Weitere Aktionen" triggerClassName="size-11 justify-center rounded-xl border border-border bg-surface-2 text-fg hover:bg-surface-3" trigger={<Icon name="MoreHorizontal" size={18} />}>
              {(close) => (
                <>
                  <PopoverItem icon="Pencil" onClick={() => { close(); setDialog("edit"); }}>Bearbeiten</PopoverItem>
                  {active && <PopoverItem icon="Flag" onClick={() => { close(); setDialog("abort"); }}>Grow abbrechen</PopoverItem>}
                  <PopoverItem icon={grow.archived ? "ArchiveRestore" : "Archive"} onClick={() => { close(); void act(() => svc.grows.archive(grow.id, !grow.archived), { title: grow.archived ? "Aus dem Archiv geholt" : "Archiviert", desc: grow.name, icon: grow.archived ? "ArchiveRestore" : "Archive" }); }}>
                    {grow.archived ? "Aus dem Archiv holen" : "Archivieren"}
                  </PopoverItem>
                  <PopoverItem icon="Trash2" danger onClick={() => { close(); setDialog("delete"); }}>Löschen …</PopoverItem>
                </>
              )}
            </Popover>
          </>
        }
      />

      <Reveal>
        <Card className="overflow-hidden p-0">
          <div className="relative h-44 sm:h-60">
            <SmartImage src={grow.cover} alt={grow.name} className="size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-3 left-4 flex gap-2">
              <Badge tone="leaf">{grow.type}</Badge>
              <Badge className="bg-black/40 text-white border-white/15">{grow.medium}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface p-4">
                <div className="flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name={s.icon} size={13} /> {s.label}</div>
                <div className="mt-1 font-semibold tnum">{s.value}</div>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      {readOnly && (
        <Card className="flex items-center gap-2 border-dashed p-4 text-sm text-fg-muted" data-testid="grow-readonly-banner">
          <Icon name="Eye" size={16} /> Du siehst den Grow von {ownerName ?? "diesem Mitglied"} – nur lesend. Notizen und Kosten bleiben privat.
        </Card>
      )}

      {grow.archived && !readOnly && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed p-4 text-sm" data-testid="grow-archived-banner">
          <span className="flex items-center gap-2 text-fg-muted"><Icon name="Archive" size={16} /> Dieser Grow ist archiviert und erscheint nicht in der Liste der aktiven Grows.</span>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void act(() => svc.grows.archive(grow.id, false), { title: "Aus dem Archiv geholt", desc: grow.name, icon: "ArchiveRestore" })}>Zurückholen</Button>
        </Card>
      )}

      {strainRows.length > 1 && (
        <Card className="space-y-3 p-5" data-testid="grow-strains">
          <h2 className="text-sm font-semibold text-fg-muted">Sorten ({strainRows.length}){plantTotal != null ? ` · ${plantTotal} Pflanzen` : ""}</h2>
          <ul className="divide-y divide-border">
            {strainRows.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm" data-testid="grow-strain-row">
                <span className="min-w-0"><span className="font-medium">{x.name}</span>{x.breeder && <span className="text-fg-subtle"> · {x.breeder}</span>}</span>
                <span className="text-xs text-fg-muted tnum">
                  {x.plants != null ? `${x.plants} ${x.plants === 1 ? "Pflanze" : "Pflanzen"}` : ""}
                  {grow.status === "harvested" && (x.wetG != null || x.dryG != null) ? `${x.plants != null ? " · " : ""}nass ${formatGrams(x.wetG)} · trocken ${formatGrams(x.dryG)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-border pt-3" data-testid="strain-filter">
            <span className="text-xs font-medium text-fg-subtle">Anzeigen für</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sorten-Filter">
              <Chip type="button" active={strainFilter === ALL_STRAINS} aria-pressed={strainFilter === ALL_STRAINS} onClick={() => setStrainFilter(ALL_STRAINS)} data-testid="strain-filter-all">Alle Sorten</Chip>
              {strainChoices.map((x) => (
                <Chip key={x.id} type="button" active={strainFilter === x.id} aria-pressed={strainFilter === x.id} onClick={() => setStrainFilter(x.id)} data-testid="strain-filter-chip">{x.name}</Chip>
              ))}
            </div>
            {strainFilter !== ALL_STRAINS && <p className="text-xs text-fg-subtle" data-testid="strain-filter-hint">Zeigt Einträge, Fotos sowie pH/EC dieser Sorte – dazu alles, was für den ganzen Grow gilt (u. a. Temperatur und Luftfeuchte).</p>}
          </div>
        </Card>
      )}

      {!active && (
        <Card className="space-y-3 p-5" data-testid="grow-result">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={grow.status === "harvested" ? "leaf" : "danger"}>{statusLabel[grow.status]}</Badge>
            <span className="text-sm text-fg-muted">am {formatDay(grow.endedOn)} · nach {grow.day} Tagen</span>
          </div>
          {grow.status === "harvested" && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border">
              <div className="bg-surface p-3"><div className="text-xs text-fg-subtle">Nassgewicht</div><div className="font-semibold tnum">{formatGrams(grow.harvest?.wetG)}</div></div>
              <div className="bg-surface p-3"><div className="text-xs text-fg-subtle">Trockengewicht</div><div className="font-semibold tnum">{formatGrams(grow.harvest?.dryG)}</div></div>
            </div>
          )}
          {grow.harvest?.note && <p className="text-sm text-fg-muted">{grow.harvest.note}</p>}
          {!readOnly && <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDialog(grow.status === "harvested" ? "harvest" : "abort")}><Icon name="Pencil" size={14} /> {grow.status === "harvested" ? "Ernte bearbeiten" : "Abschluss bearbeiten"}</Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => void act(() => svc.grows.reopen(grow.id), { title: "Grow wieder aufgenommen", desc: grow.name, icon: "RotateCcw" })}><Icon name="RotateCcw" size={14} /> Wieder aufnehmen</Button>
          </div>}
        </Card>
      )}

      <Reveal>
        <Card className="space-y-5 p-5">
          <PhaseTimeline grow={grow} />
          {active && !readOnly && (
            <div className="space-y-3 border-t border-border pt-4" data-testid="phase-controls">
              <div className="text-xs font-medium text-fg-subtle">Aktuelle Phase festlegen</div>
              <div className="flex flex-wrap gap-2">
                {GROW_PHASE_NAMES.map((name) => (
                  <Button
                    key={name}
                    size="sm"
                    variant={grow.phase === name ? "primary" : "secondary"}
                    disabled={busy}
                    aria-pressed={grow.phase === name}
                    onClick={() => grow.phase !== name && void act(() => svc.grows.setPhase(grow.id, name), { title: `Phase: ${name}`, desc: grow.name, icon: "GitBranch" })}
                  >
                    {name}
                  </Button>
                ))}
              </div>
              <Button onClick={() => setDialog("harvest")} data-testid="finish-harvest"><Icon name="Scissors" size={16} /> Ernte abschließen</Button>
            </div>
          )}
        </Card>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Reveal>
            <GrowMeasurements grow={grow} onChanged={saved} readOnly={readOnly} strainFilter={strainFilter} />
          </Reveal>

          <Reveal>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="NotebookPen" size={16} /> Log-Einträge</h2>
                {!readOnly && <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={exportLogs} data-testid="export-logs" aria-label="Tagebuch als CSV exportieren"><Icon name="Download" size={15} /> CSV</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate("create", { kind: "log", growId: grow.id })}>+ Eintrag</Button>
                </div>}
              </div>
              {shownLogs.length === 0 && <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-fg-muted">{grow.logs.length === 0 ? "Noch keine Einträge. Halte Gießen, Düngen, Training und Beobachtungen fest." : "Keine Einträge für diese Sorte."}</p>}
              <div className="space-y-1">
                {shownLogs.map((l, i) => (
                  <div key={l.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn("grid size-8 place-items-center rounded-full", toneSoft[logTone[l.tag]])}><Icon name="NotebookPen" size={14} /></span>
                      {i < shownLogs.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{l.title}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-fg-subtle">
                          Tag {l.day} · {formatDay(l.date)}
                          {!readOnly && <button type="button" aria-label={`Eintrag „${l.title}“ bearbeiten`} onClick={() => setEditLog(l)} className="grid size-8 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg" data-testid="edit-log"><Icon name="Pencil" size={14} /></button>}
                        </span>
                      </div>
                      {l.text && <p className="mt-0.5 whitespace-pre-line text-sm text-fg-muted">{l.text}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={logTone[l.tag]}>{l.tag}</Badge>
                        {multi && <StrainTags names={strainNamesOf(grow, l.strainIds)} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Image" size={16} /> Galerie <span className="text-fg-subtle">({shownPhotos.length})</span></h2>
                <div className="flex items-center gap-1">
                {grow.photos.length >= 2 && (
                  <Button size="sm" variant="ghost" onClick={() => setComparing(true)} data-testid="compare-photos"><Icon name="Layers" size={15} /> Vergleichen</Button>
                )}
                {!readOnly && <ImagePickButton onUploaded={addPhoto} className="flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent/10">
                  <Icon name="Camera" size={16} /> Foto hinzufügen
                </ImagePickButton>}
                </div>
              </div>
              {shownPhotos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-fg-muted">{grow.photos.length === 0 ? "Noch keine Fotos. Dokumentiere deinen Grow – das erste Foto wird zum Titelbild." : "Keine Fotos für diese Sorte."}</p>
              ) : (
              <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
                {shownPhotos.map((photo, i) => (
                  <figure key={photo.id} className="relative overflow-hidden rounded-xl" data-testid="grow-photo">
                    <button type="button" onClick={() => setLightbox(i)} className="block w-full" aria-label={photo.caption || `Foto ${i + 1} vergrößern`}>
                      <img src={resolveMedia(photo.url)} alt={photo.caption || `Galerie ${i + 1}`} loading="lazy" className="w-full object-cover transition duration-500 hover:scale-105" style={{ aspectRatio: i % 2 ? "3/4" : "4/3" }} />
                    </button>
                    {photo.cover && <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white"><Icon name="Star" size={11} /> Titelbild</span>}
                    {!readOnly && <button type="button" aria-label={`Foto ${i + 1} bearbeiten`} onClick={() => setEditPhotoId(photo.id)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75" data-testid="edit-photo"><Icon name="Pencil" size={14} /></button>}
                    {photo.caption && <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs text-white">{photo.caption}</figcaption>}
                    {multi && (photo.strainIds?.length ?? 0) > 0 && <StrainTags names={strainNamesOf(grow, photo.strainIds)} className="flex flex-wrap gap-1 bg-surface-2 px-2 py-1.5" />}
                  </figure>
                ))}
              </div>
              )}
            </Card>
          </Reveal>
        </div>

        <div className="space-y-6">
          <Reveal delay={0.05}>
            <Card className="flex flex-col items-center p-5 text-center">
              <h2 className="mb-3 self-start text-sm font-semibold text-fg-muted">Zustand</h2>
              <div className="grid w-full grid-cols-3 gap-2" role="group" aria-label="Zustand der Pflanzen">
                {(Object.keys(conditionLabel) as GrowCondition[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={busy || readOnly}
                    aria-pressed={grow.condition === key}
                    onClick={() => grow.condition !== key && void act(() => svc.grows.update(grow.id, { condition: key }), { title: `Zustand: ${conditionLabel[key]}`, desc: grow.name, icon: conditionIcon[key] })}
                    className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 py-3 text-xs font-medium transition", grow.condition === key ? cn("border-transparent", toneSoft[conditionTone[key]]) : "border-border text-fg-muted hover:bg-surface-2")}
                  >
                    <Icon name={conditionIcon[key]} size={18} />
                    {conditionLabel[key]}
                  </button>
                ))}
              </div>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <Row label="Medium" value={grow.medium} />
                <Row label="Typ" value={grow.type} />
                <Row label="Breeder" value={grow.breeder} />
                <Row label="Start" value={new Date(grow.startDate).toLocaleDateString("de-DE")} />
                {!readOnly && <Row label="Sichtbar für" value={visibilityLabel[grow.visibility ?? "private"]} />}
              </div>
              {!readOnly && <Button className="mt-4 w-full" variant="secondary" onClick={() => navigate("report")}>
                <Icon name="Newspaper" size={16} /> Grow-Report
              </Button>}
            </Card>
          </Reveal>
        </div>
      </div>

      <SwipeLightbox
        open={lightbox !== null}
        images={shownPhotos.map((photo, i) => ({ src: photo.url, alt: `${grow.name}, Foto ${i + 1}`, caption: photo.caption || "Wische seitlich zum Blättern, nach unten zum Schließen" }))}
        index={lightbox ?? 0}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(null)}
      />

      {comparing && grow.photos.length >= 2 && <PhotoCompareModal grow={grow} open onClose={() => setComparing(false)} />}
      {editLog && <EditLogModal key={editLog.id} grow={grow} log={editLog} open onClose={() => setEditLog(null)} onSaved={() => { setEditLog(null); void saved(); }} />}
      {editPhotoId && grow.photos.find((p) => p.id === editPhotoId) && (
        <PhotoModal key={editPhotoId} grow={grow} photo={grow.photos.find((p) => p.id === editPhotoId)!} open onClose={() => setEditPhotoId(null)} onSaved={() => { setEditPhotoId(null); void saved(); }} />
      )}
      {dialog === "edit" && <EditGrowModal grow={grow} open onClose={() => setDialog(null)} onSaved={() => void saved()} />}
      {(dialog === "harvest" || dialog === "abort") && (
        <FinishGrowModal grow={grow} open initialOutcome={dialog === "harvest" ? "harvested" : "aborted"} onClose={() => setDialog(null)} onSaved={() => void saved()} />
      )}
      {dialog === "delete" && (
        <DeleteGrowModal
          grow={grow}
          open
          onClose={() => setDialog(null)}
          onArchive={() => { setDialog(null); void act(() => svc.grows.archive(grow.id, true), { title: "Archiviert", desc: grow.name, icon: "Archive" }); }}
          onDeleted={() => { invalidate("grows"); back(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
