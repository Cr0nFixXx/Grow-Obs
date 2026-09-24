import { useState } from "react";
import { MapPin } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, Meter, PageHeader, SearchInput, Segmented } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { breeders, strains } from "@/mocks/data";

const colorVar: Record<string, string> = { leaf: "accent", soil: "accent-2", info: "info", warning: "warning" };

export default function Breeders() {
  const { params } = useNav();
  const b = params?.breederId ? breeders.find((x) => x.id === params.breederId) : null;
  return b ? <BreederDetail b={b} /> : <BreederList />;
}

function BreederList() {
  const { navigate } = useNav();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const list = breeders.filter(
    (b) => (!verifiedOnly || b.verified) && `${b.name} ${b.location}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Breeder & Seeds" subtitle="Entdecke renommierte Züchter und ihre Genetiken." icon="Store" />
      <Reveal>
        <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Breeder oder Region…" value={q} onChange={(e) => setQ(e.target.value)} className="lg:max-w-xs" />
          <Chip active={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)}><Icon name="ShieldCheck" size={14} /> Verifiziert</Chip>
          <div className="lg:ml-auto">
            <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "Grid", icon: "LayoutGrid" }, { value: "list", label: "Liste", icon: "List" }]} />
          </div>
        </Card>
      </Reveal>

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b, i) => (
            <Reveal key={b.id} delay={i * 0.04}>
              <button onClick={() => navigate("breeders", { breederId: b.id })} className="card card-hover h-full w-full p-5 text-left">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, var(--${colorVar[b.logoColor] ?? "accent"}), color-mix(in oklab, var(--${colorVar[b.logoColor] ?? "accent"}) 50%, transparent))` }}>
                    <Icon name="Store" size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold">{b.name}{b.verified && <Icon name="ShieldCheck" size={15} className="text-info-500" />}</div>
                    <div className="flex items-center gap-1 text-xs text-fg-subtle"><MapPin className="size-3" /> {b.location}</div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-fg-muted">{b.bio}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1"><Icon name="Star" size={13} className="text-warning-500" /> {b.rating}</span>
                  <span className="text-fg-subtle">{b.strains} Sorten</span>
                  <span className="text-fg-subtle">seit {b.founded}</span>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      ) : (
        <Reveal>
          <Card className="divide-y divide-border p-0">
            {list.map((b) => (
              <button key={b.id} onClick={() => navigate("breeders", { breederId: b.id })} className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-surface-2">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: `var(--${colorVar[b.logoColor] ?? "accent"})` }}><Icon name="Store" size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium">{b.name}{b.verified && <Icon name="ShieldCheck" size={14} className="text-info-500" />}</div>
                  <div className="truncate text-xs text-fg-subtle">{b.location} · {b.bio}</div>
                </div>
                <div className="hidden text-right text-sm sm:block">
                  <div className="flex items-center justify-end gap-1"><Icon name="Star" size={13} className="text-warning-500" /> {b.rating}</div>
                  <div className="text-xs text-fg-subtle">{b.strains} Sorten</div>
                </div>
              </button>
            ))}
          </Card>
        </Reveal>
      )}
    </div>
  );
}

function BreederDetail({ b }: { b: (typeof breeders)[number] }) {
  const { back } = useNav();
  const toast = useToast();
  const list = strains.filter((s) => s.breeder === b.name);
  const stats = [
    { label: "Bewertung", value: `${b.rating}★`, icon: "Star" },
    { label: "Sorten", value: `${b.strains}`, icon: "Leaf" },
    { label: "Gegründet", value: `${b.founded}`, icon: "CalendarDays" },
    { label: "Region", value: b.location.split(",")[1]?.trim() ?? b.location, icon: "MapPin" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={["Breeder", b.name]}
        title={
          <span className="flex items-center gap-2">{b.name}{b.verified && <Icon name="ShieldCheck" className="text-info-500" />}</span>
        }
        subtitle={b.bio}
        icon="Store"
        actions={<><Button variant="secondary" onClick={back}>Zurück</Button><Button onClick={() => toast.push({ title: `${b.name} abonniert`, tone: "leaf", icon: "Users" })}>Folgen</Button></>}
      />
      <Reveal>
        <Card className="grid grid-cols-2 gap-px overflow-hidden p-0 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs text-fg-subtle"><Icon name={s.icon} size={13} /> {s.label}</div>
              <div className="mt-1 font-semibold tnum">{s.value}</div>
            </div>
          ))}
        </Card>
      </Reveal>
      <Reveal>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-fg-muted">Sorten von {b.name} ({list.length})</h2>
          <div className="space-y-2">
            {list.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:bg-surface-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Icon name="Leaf" size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-medium">{s.name}</span><Badge tone={s.type === "Sativa" ? "info" : s.type === "Indica" ? "soil" : "leaf"}>{s.type}</Badge></div>
                  <div className="mt-1.5"><Meter label="THC" value={s.thc} max={30} color="var(--accent)" suffix=" %" /></div>
                </div>
                <div className="text-right text-sm">
                  <div className="flex items-center justify-end gap-1"><Icon name="Star" size={13} className="text-warning-500" /> {s.rating}</div>
                  <div className="text-xs text-fg-subtle">{s.flowering} Wo. Blüte</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
