import { useState } from "react";
import { growStrains, strainSummary } from "@/lib/grow-strains";
import type { EnvPoint } from "@/types";
import { conditionLabel, conditionTone, formatDay, isActiveGrow, statusLabel } from "@/lib/grows";
import { useCurrentUser } from "@/lib/auth";
import { ArrowRight, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, Chip, CollapsibleCard, EmptyState, ProgressBar, SmartImage, StatCard } from "@/components/ui";
import { Donut, Gauge, Sparkline } from "@/components/charts";
import { CountUp, Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { climate, consumptionSeries, quickStats } from "@/mocks/data";
import { activityTarget } from "@/lib/activity-target";
import { useActivity, useGrows, useSeedOffers, useTasks } from "@/data/hooks";
import { useServices } from "@/data/DataContext";
import { eur, n, pct } from "@/lib/format";
import { config } from "@/lib/config";
import { useFeatures } from "@/config/FeatureContext";

const prioTone = { hoch: "danger", mittel: "warning", niedrig: "info" } as const;

function SectionHead({ title, icon, action }: { title: string; icon: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
        <Icon name={icon} size={16} /> {title}
      </h2>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const currentUser = useCurrentUser();
  const { navigate } = useNav();
  const toast = useToast();
  const { grows } = useGrows();
  const { activity } = useActivity();
  const { isEnabled } = useFeatures();
  const marketplaceOn = isEnabled("marketplace");
  // Ticker nur bei aktivem Marktplatz: sonst 403 bei jedem Laden und bei „Teilweise aktualisiert“ (B-80).
  const { offers } = useSeedOffers(marketplaceOn);
  const svc = useServices();
  const { tasks: loadedTasks } = useTasks();
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({});
  const tasks = loadedTasks.slice(0, 5).map((t) => (t.id in taskOverrides ? { ...t, done: taskOverrides[t.id] } : t));
  const toggleTask = (id: string) => {
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    setTaskOverrides((o) => ({ ...o, [id]: !cur.done })); // optimistisch
    svc.tasks.toggle(id).catch(() => {
      setTaskOverrides((o) => ({ ...o, [id]: cur.done }));
      toast.push({ title: "Task nicht aktualisiert", tone: "danger", icon: "AlertTriangle" });
    });
  };
  const [showAi, setShowAi] = useState(true);

  // Demo-Werte (mocks/data) nur im Mock-Modus; im API-Modus zählen ausschließlich echte Daten.
  const demo = config.useMock;
  const activeGrows = grows.filter(isActiveGrow);
  const openTasks = loadedTasks.filter((t) => !t.done).length;
  const needAttention = activeGrows.filter((g) => g.condition !== "gesund").length;
  type Stat = { id: string; label: string; value: React.ReactNode; delta?: string; trend?: "up" | "down"; icon: string; color: string };
  const stats: Stat[] = demo
    ? quickStats.map((s) => ({ id: s.id, label: s.label, value: <CountUp value={s.num} suffix={s.suffix} />, delta: s.delta, trend: s.trend as "up" | "down", icon: s.icon, color: s.color }))
    : [
        { id: "q1", label: "Aktive Grows", value: <CountUp value={activeGrows.length} />, icon: "Sprout", color: "leaf" },
        { id: "q2", label: "Offene Tasks", value: <CountUp value={openTasks} />, icon: "ListChecks", color: "warning" },
        { id: "q4", label: "Brauchen Aufmerksamkeit", value: <CountUp value={needAttention} />, icon: "HeartPulse", color: needAttention ? "warning" : "leaf" },
      ];
  // Kacheln öffnen den zugehörigen Bereich (B-90): Grows → Grow-Liste, Tasks → Aufgabenliste weiter unten.
  const statAction = (id: string): (() => void) | undefined => {
    if (id === "q1" || id === "q4") return () => navigate("grows");
    if (id === "q2") return () => document.getElementById("dashboard-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return undefined;
  };
  // Klima: im API-Modus der letzte erfasste Messpunkt des ersten aktiven Grows mit Klimadaten.
  const lastClimate = (g: { env: EnvPoint[] }) => [...g.env].reverse().find((e) => e.temp !== null || e.rh !== null);
  const climateGrow = activeGrows.find((g) => lastClimate(g));
  const lastEnv = climateGrow ? lastClimate(climateGrow) : undefined;

  const costBreakdown = [
    { label: "Strom", value: 62, color: "var(--accent)" },
    { label: "Substrat", value: 18, color: "var(--accent-2)" },
    { label: "Dünger", value: 12, color: "var(--info)" },
    { label: "Wasser", value: 8, color: "var(--warning)" },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <Reveal>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-fg-muted">{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hallo, {currentUser.name.split(" ")[0]} 🌿</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate("ai")}>
              <Sparkles className="size-4" /> KI fragen
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => navigate("create", { kind: "grow" })}>
              <Plus className="size-4" /> Neuer Grow
            </Button>
          </div>
        </div>
      </Reveal>

      {/* AI banner (Demo: erfundene Empfehlung; im API-Modus gibt es noch keine echte KI) */}
      {demo && showAi && (
        <Reveal delay={0.05}>
          <Card className="relative overflow-hidden border-accent/25 bg-accent/[0.06] p-4 sm:p-5">
            <button onClick={() => setShowAi(false)} className="absolute right-3 top-3 text-fg-subtle hover:text-fg" aria-label="Schließen">
              <X className="size-4" />
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Icon name="BrainCircuit" size={22} />
              </span>
              <div className="flex-1">
                <div className="font-semibold">KI-Empfehlung für heute</div>
                <p className="text-sm text-fg-muted">Deine VPD liegt bei {climate.vpd.toFixed(2)} kPa – minimal über dem Optimum. Die Lüftung um 10 % zu drosseln, könnte helfen.</p>
              </div>
              <Button variant="soft" size="sm" onClick={() => navigate("ai")}>
                Vorschlag ansehen <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Quick stats */}
      <StaggerGroup className={cn("grid grid-cols-2 gap-3 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1", stats.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {stats.map((s) => (
          <StaggerItem key={s.id}>
            <StatCard label={s.label} value={s.value} delta={s.delta} trend={s.trend} icon={s.icon} tone={s.color as never} onClick={statAction(s.id)} />
          </StaggerItem>
        ))}
      </StaggerGroup>

      {/* Live seed ticker */}
      {marketplaceOn && (
      <Reveal>
        <Card className="overflow-hidden p-4">
          <SectionHead
            title="Live Seed-Shop Angebote"
            icon="Store"
            action={
              <span className="flex items-center gap-1.5 text-xs font-medium text-danger">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-danger" />
                </span>
                LIVE
              </span>
            }
          />
          {offers.length === 0 ? (
            <p className="py-3 text-center text-sm text-fg-muted">Aktuell keine Angebote verfügbar.</p>
          ) : (
          <div className="group/ticker ticker-scroll mask-fade-x overflow-hidden">
            <div className="ticker-track flex w-max touch-pan-x snap-x snap-mandatory gap-3 animate-marquee">
              {[...offers, ...offers].map((o, i) => {
                const discount = o.oldPrice ? Math.round((1 - o.price / o.oldPrice) * 100) : 0;
                return (
                  <button
                    key={i}
                    onClick={() => navigate("marketplace")}
                    className={cn("flex min-h-11 w-60 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition hover:border-border-strong hover:elev-2", i >= offers.length && "ticker-copy")}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                      <Icon name="Leaf" size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{o.strain}</span>
                      <span className="block truncate text-xs text-fg-subtle">{o.breeder} · {o.shop}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-bold text-accent">{eur(o.price)}</span>
                        {o.oldPrice && <span className="text-xs text-fg-subtle line-through">{eur(o.oldPrice)}</span>}
                      </span>
                    </span>
                    {discount > 0 && <Badge tone="danger">-{discount}%</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </Card>
      </Reveal>
      )}

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Active grows */}
          <Reveal>
            <Card className="p-4 sm:p-5">
              <SectionHead
                title="Aktive Grows"
                icon="Sprout"
                action={<button onClick={() => navigate("grows")} className="-my-2 py-2 text-sm text-accent hover:underline">Alle</button>}
              />
              {activeGrows.length === 0 && (
                <EmptyState icon="Sprout" title="Noch kein aktiver Grow" desc="Lege deinen ersten Grow an, um Fortschritt, Gesundheit und Tasks zu verfolgen." action={<Button size="sm" onClick={() => navigate("create", { kind: "grow" })}><Plus className="size-4" /> Neuer Grow</Button>} />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {activeGrows.slice(0, 2).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => navigate("grows", { growId: g.id })}
                    className="card card-hover overflow-hidden p-0 text-left"
                  >
                    <div className="flex gap-3 p-3">
                      <SmartImage src={g.cover} alt={g.strain} className="size-16 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{g.name}</span>
                          <Badge tone={g.status === "harvested" ? "leaf" : g.phase === "Blüte" ? "soil" : "info"}>{g.status === "active" ? g.phase : statusLabel[g.status]}</Badge>
                        </div>
                        <div className="truncate text-xs text-fg-subtle">{strainSummary(growStrains(g).map((x) => x.name))} · {g.medium}</div>
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-[11px] text-fg-subtle">
                            <span>Tag {g.day}/{g.totalDays}</span>
                            <Badge tone={conditionTone[g.condition]}>{conditionLabel[g.condition]}</Badge>
                          </div>
                          <ProgressBar value={g.progress} />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 border-t border-border px-3 py-2">
                      {g.phases.map((p) => (
                        <div key={p.key} className="flex flex-1 items-center gap-1">
                          <span className={cn("h-1.5 flex-1 rounded-full", p.done ? "bg-accent" : "bg-surface-3")} />
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>

          {/* Tasks */}
          <Reveal>
            <Card id="dashboard-tasks" className="scroll-mt-20 p-4 sm:p-5">
              <SectionHead title="Nächste Tasks" icon="ListChecks" action={<Chip onClick={() => navigate("create", { kind: "task" })}>+ Task</Chip>} />
              {tasks.length === 0 && <p className="py-3 text-center text-sm text-fg-muted">Keine offenen Tasks. Mit „+ Task“ legst du eine neue an.</p>}
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:bg-surface-2">
                    <button
                      onClick={() => toggleTask(t.id)}
                      className={cn("grid size-5 shrink-0 place-items-center rounded-md border transition-colors", t.done ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface-2")}
                      aria-label="Erledigt"
                    >
                      {t.done && <Icon name="CheckCircle2" size={12} />}
                    </button>
                    <div className={cn("min-w-0 flex-1", t.done && "opacity-50")}>
                      <div className={cn("text-sm font-medium", t.done && "line-through")}>{t.title}</div>
                      <div className="truncate text-xs text-fg-subtle">{t.grow} · {t.when}</div>
                    </div>
                    <Badge tone={prioTone[t.prio as keyof typeof prioTone]}>{t.prio}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          {/* Activity feed */}
          <Reveal>
            <CollapsibleCard title="Aktivität" icon="Activity">
              {activity.length === 0 && <p className="py-3 text-center text-sm text-fg-muted">Noch keine Aktivität.</p>}
              <div className="space-y-1" role="list">
                {activity.map((a) => (
                  <button type="button" key={a.id} role="listitem" onClick={() => { const t = activityTarget(a); navigate(t.view, t.params); }} className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent">
                    <Avatar src={a.avatar} name={a.who} size={36} />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="text-fg-muted">{a.who} {a.action} </span>
                      <span className="font-medium">{a.target}</span>
                      <div className="text-xs text-fg-subtle">{a.time}</div>
                    </div>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", a.color === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : a.color === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : a.color === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : "bg-warning-500/12 text-warning-500 dark:text-warning-400")}>
                      <Icon name={a.icon} size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </CollapsibleCard>
          </Reveal>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* Climate (Demo: erfundene Werte inkl. Wetter-Vorschau) */}
          {demo && (
          <Reveal delay={0.05}>
            <Card className="p-4 sm:p-5">
              <SectionHead title="Klima · Grow-Raum" icon="Thermometer" action={<Badge tone={climate.vpdStatus === "optimal" ? "leaf" : "warning"}>{climate.vpdStatus === "optimal" ? "Optimal" : "Achtung"}</Badge>} />
              <div className="flex items-center justify-around py-2">
                <div className="text-center">
                  <Gauge value={climate.temp} max={35} size={92} stroke={8} color="var(--accent)">
                    <div>
                      <div className="text-lg font-bold tnum">{climate.temp}°</div>
                      <div className="text-[10px] text-fg-subtle">Temp</div>
                    </div>
                  </Gauge>
                </div>
                <div className="text-center">
                  <Gauge value={climate.rh} max={100} size={92} stroke={8} color="var(--info)">
                    <div>
                      <div className="text-lg font-bold tnum">{climate.rh}%</div>
                      <div className="text-[10px] text-fg-subtle">Feuchte</div>
                    </div>
                  </Gauge>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "VPD", value: `${climate.vpd.toFixed(2)}`, icon: "Droplets", unit: "kPa" },
                  { label: "EC", value: `${climate.ec}`, icon: "Zap", unit: "mS" },
                  { label: "pH", value: `${climate.ph}`, icon: "Activity", unit: "" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-surface-2 p-2">
                    <Icon name={m.icon} size={14} className="mx-auto text-fg-subtle" />
                    <div className="mt-1 text-sm font-semibold tnum">{m.value}</div>
                    <div className="text-[10px] text-fg-subtle">{m.label} {m.unit}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between rounded-xl bg-surface-2 p-2">
                {climate.forecast.map((f) => (
                  <div key={f.day} className="flex flex-col items-center gap-1 text-center">
                    <Icon name={f.icon} size={18} className="text-accent" />
                    <span className="text-[10px] text-fg-subtle">{f.day}</span>
                    <span className="text-xs font-semibold tnum">{f.temp}°</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
          )}
          {/* Climate (API-Modus: echter letzter Messpunkt, sonst Leerzustand) */}
          {!demo && (
          <Reveal delay={0.05}>
            <Card className="p-4 sm:p-5" data-testid="climate-card">
              <SectionHead title="Klima · Grow-Raum" icon="Thermometer" action={climateGrow ? <Badge>Tag {lastEnv?.day}</Badge> : undefined} />
              {lastEnv && climateGrow ? (
                <>
                  <p className="mb-1 truncate text-xs text-fg-subtle">{climateGrow.name} · letzter Messwert vom {formatDay(lastEnv.date)}</p>
                  <div className="flex items-center justify-around py-2">
                    <div className="text-center">
                      <Gauge value={lastEnv.temp ?? 0} max={35} size={92} stroke={8} color="var(--accent)">
                        <div>
                          <div className="text-lg font-bold tnum">{lastEnv.temp ?? "–"}°</div>
                          <div className="text-[10px] text-fg-subtle">Temp</div>
                        </div>
                      </Gauge>
                    </div>
                    <div className="text-center">
                      <Gauge value={lastEnv.rh ?? 0} max={100} size={92} stroke={8} color="var(--info)">
                        <div>
                          <div className="text-lg font-bold tnum">{lastEnv.rh ?? "–"}%</div>
                          <div className="text-[10px] text-fg-subtle">Feuchte</div>
                        </div>
                      </Gauge>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                    {[
                      { label: "VPD", value: lastEnv.vpd != null ? lastEnv.vpd.toFixed(2) : "–", icon: "Droplets", unit: "kPa" },
                      { label: "EC", value: lastEnv.ec != null ? String(lastEnv.ec) : "–", icon: "Zap", unit: "mS" },
                    ].map((m) => (
                      <div key={m.label} className="rounded-xl bg-surface-2 p-2">
                        <Icon name={m.icon} size={14} className="mx-auto text-fg-subtle" />
                        <div className="mt-1 text-sm font-semibold tnum">{m.value}</div>
                        <div className="text-[10px] text-fg-subtle">{m.label} {m.unit}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon="Thermometer" title="Noch keine Klimadaten" desc="Klimawerte erscheinen, sobald zu einem aktiven Grow Messpunkte erfasst wurden." />
              )}
            </Card>
          </Reveal>
          )}

          {/* Kosten-Snapshot (Demo: erfundene Zahlen; im API-Modus gibt es noch keine Kostendaten) */}
          {demo && (
          <Reveal delay={0.1}>
            <CollapsibleCard title="Kosten-Snapshot" icon="Euro" action={<button onClick={() => navigate("consumption")} className="-my-2 py-2 text-sm text-accent hover:underline">Details</button>}>
              <div className="flex items-center gap-4">
                <Donut data={costBreakdown} size={108} stroke={14}>
                  <div>
                    <div className="text-[10px] text-fg-subtle">dieser Monat</div>
                    <div className="text-base font-bold tnum">{eur(168)}</div>
                  </div>
                </Donut>
                <div className="flex-1 space-y-1.5">
                  {costBreakdown.map((c) => (
                    <div key={c.label} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 text-fg-muted">{c.label}</span>
                      <span className="font-medium tnum">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-fg-muted">Kostenverlauf 12 Mo.</span>
                  <span className="font-medium text-leaf-500 dark:text-leaf-400">-12%</span>
                </div>
                <Sparkline data={consumptionSeries.map((c) => c.kosten)} height={40} />
              </div>
            </CollapsibleCard>
          </Reveal>
          )}

          {/* Community pulse */}
          <Reveal delay={0.15}>
            <Card className="p-4 sm:p-5">
              <SectionHead title="Community" icon="Users" />
              {demo && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <div className="text-lg font-bold tnum">{n(12400)}</div>
                    <div className="text-[10px] text-fg-subtle">Grower</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <div className="text-lg font-bold tnum">{n(3200)}</div>
                    <div className="text-[10px] text-fg-subtle">Showcases</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <div className="text-lg font-bold tnum">{pct(98)}</div>
                    <div className="text-[10px] text-fg-subtle">Zufrieden</div>
                  </div>
                </div>
              )}
              <Button variant="secondary" className={cn("w-full", demo && "mt-3")} onClick={() => navigate("forum")}>
                Zum Forum <ArrowRight className="size-4" />
              </Button>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
