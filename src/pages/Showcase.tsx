import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import {
  Avatar, Badge, Button, Card, Chip, Field, Input, Meter, Modal, PageHeader, Popover, PopoverItem,
  ProgressBar, RatingStars, Segmented, Select, Slider, StatCard, Textarea, Toggle,
} from "@/components/ui";
import { Bars, Donut, Gauge, SeriesChart, Sparkline } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { cn } from "@/utils/cn";
import { toneSolid } from "@/lib/tokens";
import type { Tone } from "@/lib/tokens";
import { AVATARS, consumptionSeries, currentUser } from "@/mocks/data";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

const tones: Tone[] = ["leaf", "soil", "info", "warning", "danger"];

export default function Showcase() {
  const toast = useToast();
  const [slider, setSlider] = useState(40);
  const [toggle, setToggle] = useState(true);
  const [seg, setSeg] = useState("a");
  const [rating, setRating] = useState(4);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Design-System" subtitle="Showcase der wiederverwendbaren Komponenten-Bibliothek." icon="Layers" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Section title="Buttons">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="soil">Soil</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </Section>
        </Reveal>

        <Reveal delay={0.04}>
          <Section title="Badges · Chips · Avatars">
            <div className="flex flex-wrap gap-2">
              <Badge tone="leaf">Leaf</Badge>
              <Badge tone="soil">Soil</Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip active>Aktiv</Chip>
              <Chip>Chip</Chip>
              <Chip active><Icon name="Check" size={14} /> Ausgewählt</Chip>
            </div>
            <div className="flex items-center gap-3">
              <Avatar src={currentUser.avatar} size={40} status="online" />
              <Avatar src={AVATARS[1]} size={40} status="offline" />
              <Avatar src={AVATARS[2]} size={40} ring />
            </div>
          </Section>
        </Reveal>

        <Reveal delay={0.08}>
          <Section title="Formulare">
            <Field label="Texteingabe"><Input placeholder="z. B. Northern Haze" /></Field>
            <Field label="Auswahl"><Select><option>Option A</option><option>Option B</option></Select></Field>
            <Textarea placeholder="Mehrzeilige Eingabe…" rows={2} />
            <div>
              <div className="mb-2 flex items-center justify-between text-sm"><span>Slider</span><span className="tnum font-medium">{slider}</span></div>
              <Slider min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between"><span className="text-sm">Toggle</span><Toggle checked={toggle} onChange={setToggle} /></div>
            <Segmented value={seg} onChange={setSeg} options={[{ value: "a", label: "Eins" }, { value: "b", label: "Zwei" }, { value: "c", label: "Drei" }]} />
          </Section>
        </Reveal>

        <Reveal delay={0.12}>
          <Section title="Feedback">
            <RatingStars value={rating} onChange={setRating} />
            <Meter label="THC" value={24} max={30} color="var(--accent)" suffix=" %" />
            <div>
              <div className="mb-1.5 text-xs text-fg-muted">Progress</div>
              <ProgressBar value={68} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Demo-Wert" value="1.234" icon="TrendingUp" tone="leaf" />
              <StatCard label="Zweiter" value="56 %" icon="HeartPulse" tone="info" />
            </div>
          </Section>
        </Reveal>

        <Reveal delay={0.16}>
          <Section title="Charts">
            <div>
              <div className="mb-2 text-xs text-fg-muted">SeriesChart (Area)</div>
              <SeriesChart height={120} series={[{ name: "Wachstum", color: "var(--accent)", data: [10, 24, 40, 60, 82, 100] }]} />
            </div>
            <div className="grid grid-cols-3 items-center gap-2">
              <Gauge value={72} size={92} stroke={9} color="var(--accent)"><div className="text-sm font-bold tnum">72%</div></Gauge>
              <Donut size={92} stroke={12} data={[{ label: "A", value: 50, color: "var(--accent)" }, { label: "B", value: 30, color: "var(--info)" }, { label: "C", value: 20, color: "var(--warning)" }]} />
              <Sparkline height={60} data={consumptionSeries.map((c) => c.kosten)} color="var(--info)" />
            </div>
            <div>
              <div className="mb-2 text-xs text-fg-muted">Bars</div>
              <Bars height={110} data={["M", "D", "M", "D", "F"].map((l, i) => ({ label: l, value: [40, 65, 50, 80, 60][i], color: "var(--accent)" }))} />
            </div>
          </Section>
        </Reveal>

        <Reveal delay={0.2}>
          <Section title="Overlays & Aktionen">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => toast.push({ title: "Demo-Toast", desc: "Aus dem Showcase.", tone: "leaf", icon: "Sparkles" })}>Toast zeigen</Button>
              <Button variant="secondary" onClick={() => setModalOpen(true)}>Modal öffnen</Button>
              <Popover align="start" trigger={<span className="flex items-center gap-1.5">Popover <Icon name="ChevronDown" size={14} /></span>} triggerClassName="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium">
                {(close) => (
                  <>
                    <PopoverItem icon="Check" onClick={close}>Aktion 1</PopoverItem>
                    <PopoverItem icon="Share2" onClick={close}>Aktion 2</PopoverItem>
                    <PopoverItem icon="Flag" danger onClick={close}>Melden</PopoverItem>
                  </>
                )}
              </Popover>
            </div>
            <div className="flex flex-wrap gap-2">
              {tones.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className={cn("size-8 rounded-lg", toneSolid[t])} />
                  <span className="text-xs capitalize text-fg-muted">{t}</span>
                </div>
              ))}
            </div>
          </Section>
        </Reveal>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Demo-Modal" footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Abbrechen</Button><Button onClick={() => setModalOpen(false)}>OK</Button></>}>
        <p className="text-sm text-fg-muted">Dies ist ein Modal aus der Showcase-Seite. Auf Mobile wird es als Bottom-Sheet dargestellt.</p>
      </Modal>
    </div>
  );
}
