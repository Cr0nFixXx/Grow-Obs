import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import {
  Badge, Button, Card, Chip, EmptyState, Meter, Modal, PageHeader, RatingStars, SearchInput, Segmented, SkeletonCard,
} from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ratingBreakdown, reviews, type Strain, type Type } from "@/mocks/data";
import { useStrains } from "@/data/hooks";
import { eur } from "@/lib/format";

/** Konsistentes Farb-Coding nach Typ: Sativa = info, Indica = soil, Hybrid = leaf. */
const typeColor: Record<Type, string> = { Sativa: "info", Indica: "soil", Hybrid: "leaf" };
const maxReview = Math.max(...ratingBreakdown.map((r) => r.count));

export default function Strains() {
  const { navigate } = useNav();
  const toast = useToast();
  const { strains, loading, error } = useStrains();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"Alle" | Type>("Alle");
  const [sort, setSort] = useState<"rating" | "thc" | "price">("rating");
  const [active, setActive] = useState<Strain | null>(null);

  const list = useMemo(() => {
    let l = type === "Alle" ? [...strains] : strains.filter((s) => s.type === type);
    if (q) l = l.filter((s) => `${s.name} ${s.breeder}`.toLowerCase().includes(q.toLowerCase()));
    l.sort((a, b) => (sort === "rating" ? b.rating - a.rating : sort === "thc" ? b.thc - a.thc : a.price - b.price));
    return l;
  }, [q, type, sort, strains]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }
  if (error) return <EmptyState icon="AlertTriangle" title="Sorten nicht geladen" desc={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sorten-Sammlung"
        subtitle="Deine persönliche Genetik-Bibliothek mit detaillierten Profilen."
        icon="Leaf"
        actions={<Button variant="secondary" onClick={() => navigate("breeders")}><Icon name="Store" size={16} /> Breeder</Button>}
      />

      <Reveal>
        <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Sorte oder Breeder suchen…" value={q} onChange={(e) => setQ(e.target.value)} className="lg:max-w-xs" />
          <div className="flex flex-wrap items-center gap-2">
            {(["Alle", "Sativa", "Indica", "Hybrid"] as const).map((t) => (
              <Chip key={t} active={type === t} onClick={() => setType(t)}>{t}</Chip>
            ))}
          </div>
          <div className="lg:ml-auto">
            <Segmented
              value={sort}
              onChange={setSort}
              options={[{ value: "rating", label: "Rating" }, { value: "thc", label: "THC" }, { value: "price", label: "Preis" }]}
            />
          </div>
        </Card>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((s, i) => (
          <Reveal key={s.id} delay={i * 0.04}>
            <StrainCard s={s} onOpen={() => setActive(s)} />
          </Reveal>
        ))}
      </div>

      <StrainModal strain={active} onClose={() => setActive(null)} onCompare={() => toast.push({ title: `${active?.name} zum Vergleich`, tone: "leaf", icon: "Scale" })} />
    </div>
  );
}

function StrainCard({ s, onOpen }: { s: Strain; onOpen: () => void }) {
  const cvar = `var(--${typeColor[s.type]})`;
  return (
    <button onClick={onOpen} className="card card-hover w-full overflow-hidden p-0 text-left">
      <div className="relative h-24" style={{ background: `linear-gradient(135deg, ${cvar}, color-mix(in oklab, ${cvar} 45%, transparent))` }}>
        <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
        <div className="absolute right-3 top-3"><Badge className="border-white/25 bg-white/20 text-white">{s.type}</Badge></div>
        <div className="absolute -bottom-5 left-4 grid size-12 place-items-center rounded-xl bg-surface elev-2 text-accent"><Icon name="Leaf" size={22} /></div>
      </div>
      <div className="p-4 pt-7">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{s.name}</div>
            <div className="truncate text-xs text-fg-subtle">{s.breeder}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-sm"><Icon name="Star" size={14} className="text-warning-500" /> {s.rating}</div>
        </div>
        <div className="mt-3 space-y-2">
          <Meter label="THC" value={s.thc} max={30} color="var(--accent)" suffix=" %" />
          <Meter label="CBD" value={s.cbd} max={5} color="var(--info)" suffix=" %" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i <= s.difficulty ? "bg-warning-500" : "bg-surface-3")} />
            ))}
            <span className="ml-1 text-xs text-fg-subtle">{["Einfach", "Mittel", "Anspruchsvoll"][s.difficulty - 1]}</span>
          </div>
          <span className="font-semibold tnum">{eur(s.price)}</span>
        </div>
      </div>
    </button>
  );
}

function StrainModal({ strain, onClose, onCompare }: { strain: Strain | null; onClose: () => void; onCompare: () => void }) {
  const toast = useToast();
  const open = !!strain;
  const s = strain;
  const cvar = s ? `var(--${typeColor[s.type]})` : "var(--accent)";
  return (
    <Modal open={open} onClose={onClose} size="lg" title={s?.name}
      footer={<><Button variant="ghost" onClick={() => toast.push({ title: "Zur Sammlung", tone: "leaf", icon: "Leaf" })}>Sammeln</Button><Button onClick={onCompare}>Vergleichen</Button></>}>
      <div className="relative -mx-5 -mt-5 mb-4 h-28" style={{ background: `linear-gradient(135deg, ${cvar}, color-mix(in oklab, ${cvar} 40%, transparent))` }}>
        <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
        <div className="absolute bottom-3 left-5 flex items-center gap-2 text-white">
          <Badge className="border-white/25 bg-white/20 text-white">{s?.type}</Badge>
          <Badge className="border-white/25 bg-white/20 text-white">{s?.tag}</Badge>
        </div>
      </div>
      {s && (
        <>
          <p className="text-sm text-fg-muted">{s.notes}</p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Blütezeit", value: `${s.flowering} Wo.`, icon: "Clock" },
              { label: "Ertrag", value: s.yield.split(" ")[0], icon: "Trophy" },
              { label: "Rating", value: `${s.rating}★`, icon: "Star" },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-surface-2 p-3">
                <Icon name={x.icon} size={16} className="mx-auto text-accent" />
                <div className="mt-1 text-sm font-semibold">{x.value}</div>
                <div className="text-[10px] text-fg-subtle">{x.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Meter label="THC" value={s.thc} max={30} color="var(--accent)" suffix=" %" />
              <Meter label="CBD" value={s.cbd} max={5} color="var(--info)" suffix=" %" />
            </div>
            <div>
              <div className="mb-2 text-xs text-fg-muted">Effekte</div>
              <div className="flex flex-wrap gap-1.5">
                {s.effects.map((e) => <Badge key={e} tone="leaf">{e}</Badge>)}
              </div>
              <div className="mt-3 text-xs text-fg-muted">Preis</div>
              <div className="text-lg font-bold tnum">{eur(s.price)}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2"><RatingStars value={s.rating} size={16} /><span className="text-sm font-semibold tnum">{s.rating}</span><span className="text-xs text-fg-subtle">({s.reviews})</span></div>
              <div className="space-y-1">
                {ratingBreakdown.map((r) => (
                  <div key={r.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-fg-subtle">{r.stars}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-warning-500" style={{ width: `${(r.count / maxReview) * 100}%` }} /></div>
                    <span className="w-8 text-right text-fg-subtle tnum">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-fg-muted">Bewertungen</div>
              {reviews.slice(0, 2).map((rv) => (
                <div key={rv.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    <img src={rv.avatar} className="size-6 rounded-full object-cover" alt="" />
                    <span className="text-xs font-medium">{rv.author}</span>
                    <RatingStars value={rv.rating} size={11} />
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{rv.text}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
