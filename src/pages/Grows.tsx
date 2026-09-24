import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Image as ImageIcon, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, IconButton, Modal, PageHeader, ProgressBar, SmartImage } from "@/components/ui";
import { Gauge, SeriesChart } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { grows, type Grow } from "@/mocks/data";
import { toneSoft, type Tone } from "@/lib/tokens";

const logTone: Record<string, Tone> = {
  Gießen: "info", Dünger: "leaf", Training: "soil", Beobachtung: "warning", Schädling: "danger", Ernte: "leaf",
};

export default function Grows() {
  const { params } = useNav();
  const grow = params?.growId ? grows.find((g) => g.id === params.growId) : null;
  return grow ? <GrowDetail grow={grow} /> : <GrowList />;
}

function GrowList() {
  const { navigate } = useNav();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meine Grows"
        subtitle="Verfolge jeden Anbau – von der Keimung bis zur Ernte."
        icon="Sprout"
        actions={<Button onClick={() => navigate("strains")}><Plus className="size-4" /> Neuer Grow</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {grows.map((g, i) => (
          <Reveal key={g.id} delay={i * 0.05}>
            <GrowCard g={g} onOpen={() => navigate("grows", { growId: g.id })} />
          </Reveal>
        ))}
        <Reveal delay={0.15}>
          <button
            onClick={() => navigate("strains")}
            className="card flex h-full min-h-[230px] w-full flex-col items-center justify-center gap-2 border-dashed border-border-strong text-fg-subtle transition hover:border-accent/50 hover:text-accent"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-accent/10"><Plus className="size-6" /></span>
            <span className="font-medium">Neuen Grow starten</span>
            <span className="text-xs">Sorte wählen & Setup festlegen</span>
          </button>
        </Reveal>
      </div>
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
            <div className="text-xs text-white/80">{g.strain}</div>
          </div>
          <Badge tone={g.phase === "Blüte" ? "soil" : g.phase === "Ernte" ? "leaf" : "info"}>{g.phase}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-1 flex justify-between text-xs text-fg-subtle">
          <span>Tag {g.day}/{g.totalDays}</span>
          <span className="text-leaf-500 dark:text-leaf-400">{g.health}% Gesundheit</span>
        </div>
        <ProgressBar value={g.progress} />
        <div className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
          <Calendar className="size-3.5" /> {g.medium}
        </div>
        <div className="mt-3 flex gap-1">
          {g.phases.map((p) => (
            <span key={p.key} className={cn("h-1.5 flex-1 rounded-full", p.done ? "bg-accent" : "bg-surface-3")} title={p.label} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-fg-subtle">
          {g.phases.map((p) => <span key={p.key}>{p.label}</span>)}
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
            const active = !p.done && grow.phase === p.label;
            return (
              <div key={p.key} className="flex flex-1 flex-col items-center px-1 text-center">
                <span className={cn("grid size-7 place-items-center rounded-full border-2 border-bg text-[10px] font-bold", p.done || active ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-subtle", active && "ring-4 ring-accent/25")}>
                  {p.done ? <Icon name="CheckCircle2" size={13} /> : "•"}
                </span>
                <span className={cn("mt-2 text-xs font-medium", p.done || active ? "text-fg" : "text-fg-subtle")}>{p.label}</span>
                <span className="text-[10px] text-fg-subtle">Tag {p.start}–{p.end}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GrowDetail({ grow }: { grow: Grow }) {
  const { back, navigate } = useNav();
  const toast = useToast();
  const [lightbox, setLightbox] = useState<number | null>(null);

  const stats = [
    { label: "Tag", value: `${grow.day}/${grow.totalDays}`, icon: "CalendarDays" },
    { label: "Phase", value: grow.phase, icon: "GitBranch" },
    { label: "Erwartet", value: grow.expectedYield, icon: "Trophy" },
    { label: "Gesundheit", value: `${grow.health}%`, icon: "HeartPulse" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={["Grows", grow.name]}
        title={grow.name}
        subtitle={`${grow.strain} · ${grow.breeder} · ${grow.medium}`}
        icon="Sprout"
        actions={
          <>
            <Button variant="secondary" onClick={back}>Zurück</Button>
            <Button onClick={() => toast.push({ title: "Log gespeichert", desc: "Eintrag hinzugefügt.", tone: "leaf", icon: "NotebookPen" })}>
              <Plus className="size-4" /> Log
            </Button>
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

      <Reveal>
        <Card className="p-5"><PhaseTimeline grow={grow} /></Card>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Reveal>
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Thermometer" size={16} /> Umwelt-Verlauf</h2>
              <p className="mb-4 text-xs text-fg-subtle">Temperatur & relative Luftfeuchte der letzten Messungen</p>
              <SeriesChart
                height={200}
                labels={grow.env.map((e) => `T${e.day}`)}
                series={[
                  { name: "Temp (°C)", color: "var(--accent)", data: grow.env.map((e) => e.temp) },
                  { name: "Feuchte (%)", color: "var(--info)", data: grow.env.map((e) => e.rh) },
                ]}
              />
              <div className="mt-3 flex gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--accent)]" /> Temperatur</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--info)]" /> Luftfeuchte</span>
              </div>
            </Card>
          </Reveal>

          <Reveal>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="NotebookPen" size={16} /> Log-Einträge</h2>
                <Button size="sm" variant="ghost" onClick={() => toast.push({ title: "Neuer Log", tone: "leaf", icon: "NotebookPen" })}>+ Eintrag</Button>
              </div>
              <div className="space-y-1">
                {grow.logs.map((l, i) => (
                  <div key={l.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn("grid size-8 place-items-center rounded-full", toneSoft[logTone[l.tag]])}><Icon name="NotebookPen" size={14} /></span>
                      {i < grow.logs.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{l.title}</span>
                        <span className="shrink-0 text-xs text-fg-subtle">Tag {l.day} · {l.date}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-muted">{l.text}</p>
                      <Badge tone={logTone[l.tag]} className="mt-1.5">{l.tag}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal>
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Image" size={16} /> Galerie</h2>
              <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
                {grow.gallery.map((src, i) => (
                  <button key={i} onClick={() => setLightbox(i)} className="block w-full overflow-hidden rounded-xl">
                    <img src={src} alt={`Galerie ${i + 1}`} loading="lazy" className="w-full object-cover transition duration-500 hover:scale-105" style={{ aspectRatio: i % 2 ? "3/4" : "4/3" }} />
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-6">
          <Reveal delay={0.05}>
            <Card className="flex flex-col items-center p-5 text-center">
              <h2 className="mb-3 self-start text-sm font-semibold text-fg-muted">Gesundheit</h2>
              <Gauge value={grow.health} size={140} stroke={12} color={grow.health > 90 ? "var(--accent)" : "var(--warning)"}>
                <div>
                  <div className="text-3xl font-bold tnum">{grow.health}%</div>
                  <div className="text-xs text-fg-subtle">{grow.health > 90 ? "Vital" : "Im Auge behalten"}</div>
                </div>
              </Gauge>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <Row label="Medium" value={grow.medium} />
                <Row label="Typ" value={grow.type} />
                <Row label="Breeder" value={grow.breeder} />
                <Row label="Start" value={new Date(grow.startDate).toLocaleDateString("de-DE")} />
              </div>
              <Button className="mt-4 w-full" variant="secondary" onClick={() => navigate("report")}>
                <Icon name="Newspaper" size={16} /> Grow-Report
              </Button>
            </Card>
          </Reveal>
        </div>
      </div>

      <Modal open={lightbox !== null} onClose={() => setLightbox(null)} size="xl" title={lightbox !== null ? `Foto ${lightbox + 1} / ${grow.gallery.length}` : ""}>
        {lightbox !== null && (
          <motion.div
            className="relative"
            drag="x"
            dragSnapToOrigin
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -90) setLightbox((lightbox + 1) % grow.gallery.length);
              else if (info.offset.x > 90) setLightbox((lightbox + grow.gallery.length - 1) % grow.gallery.length);
            }}
          >
            <img src={grow.gallery[lightbox]} alt="Galerie" className="max-h-[70vh] w-full rounded-xl object-contain bg-black/5" />
            <IconButton label="Zurück" className="absolute left-2 top-1/2 -translate-y-1/2 bg-surface/90" onClick={() => setLightbox((lightbox + grow.gallery.length - 1) % grow.gallery.length)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <IconButton label="Weiter" className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface/90" onClick={() => setLightbox((lightbox + 1) % grow.gallery.length)}>
              <ChevronRight className="size-5" />
            </IconButton>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-fg-subtle"><ImageIcon className="size-3.5" /> Wische oder tippe zum Blättern</div>
          </motion.div>
        )}
      </Modal>
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
