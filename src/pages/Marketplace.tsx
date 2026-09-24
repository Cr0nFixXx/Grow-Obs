import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Chip, EmptyState, Modal, PageHeader, Popover, PopoverItem, RatingStars, SearchInput, Segmented, SkeletonCard, Slider } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useProductCategories, useProducts, useSeedOffers } from "@/data/hooks";
import type { Product } from "@/types";
import { eur } from "@/lib/format";

const condTone: Record<string, "leaf" | "info" | "warning"> = { Neu: "leaf", "Wie neu": "info", Gebraucht: "warning" };
const colorVar: Record<string, string> = { leaf: "accent", soil: "accent-2", info: "info", warning: "warning" };

export default function Marketplace() {
  const toast = useToast();
  const { products, loading, error } = useProducts();
  const { categories } = useProductCategories();
  const { offers } = useSeedOffers();
  const [cat, setCat] = useState("Alles");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [active, setActive] = useState<Product | null>(null);
  const [maxPrice, setMaxPrice] = useState(400);
  const [conds, setConds] = useState<string[]>([]);
  const toggleCond = (c: string) => setConds((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const resetFilters = () => {
    setMaxPrice(400);
    setConds([]);
  };
  const activeFilters = conds.length + (maxPrice < 400 ? 1 : 0);

  const list = useMemo(
    () =>
      products.filter(
        (p) =>
          (cat === "Alles" || p.category === cat) &&
          `${p.name} ${p.brand}`.toLowerCase().includes(q.toLowerCase()) &&
          p.price <= maxPrice &&
          (conds.length === 0 || conds.includes(p.condition))
      ),
    [products, cat, q, maxPrice, conds]
  );

  if (loading) return <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  if (error) return <EmptyState icon="AlertTriangle" title="Marktplatz nicht geladen" desc={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Marktplatz" subtitle="Seed-Angebote im Ticker und Grow-Equipment von der Community." icon="ShoppingBag" />

      {/* Live ticker */}
      <Reveal>
        <Card className="overflow-hidden p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted"><Icon name="Store" size={16} /> Live Seed-Ticker</h2>
            <span className="flex items-center gap-1.5 text-xs font-medium text-danger">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-danger/60" /><span className="relative inline-flex size-2 rounded-full bg-danger" /></span>
              LIVE
            </span>
          </div>
          <div className="group/ticker mask-fade-x overflow-hidden">
            <div className="flex w-max gap-3 animate-marquee">
              {[...offers, ...offers].map((o, i) => (
                <div key={i} className="flex w-56 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                  <Icon name="Leaf" size={16} className="text-accent" />
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{o.strain}</div><div className="truncate text-[10px] text-fg-subtle">{o.shop}</div></div>
                  <span className="text-sm font-bold text-accent">{eur(o.price)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Filters */}
      <Reveal>
        <Card className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput placeholder="Equipment suchen…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
            <div className="flex items-center gap-2 sm:ml-auto">
              <Popover
                align="end"
                triggerClassName="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium text-fg-muted transition hover:bg-surface-3"
                trigger={
                  <>
                    <Icon name="Filter" size={16} /> Filter
                    {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">{activeFilters}</span>}
                  </>
                }
              >
                {(close) => (
                  <div className="w-64">
                    <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Zustand</div>
                    {(["Neu", "Wie neu", "Gebraucht"] as const).map((c) => (
                      <PopoverItem key={c} icon={conds.includes(c) ? "Check" : undefined} onClick={() => toggleCond(c)}>
                        {c}
                      </PopoverItem>
                    ))}
                    <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Max. Preis · {eur(maxPrice)}</div>
                    <div className="px-2 pb-2 pt-1">
                      <Slider min={30} max={400} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <PopoverItem icon="Trash2" danger onClick={() => { resetFilters(); close(); }}>
                      Zurücksetzen
                    </PopoverItem>
                  </div>
                )}
              </Popover>
              <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "Grid", icon: "LayoutGrid" }, { value: "list", label: "Liste", icon: "List" }]} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
          </div>
        </Card>
      </Reveal>

      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {list.map((p, i) => (
            <Reveal key={p.id} delay={(i % 4) * 0.04}>
              <ProductCard p={p} onOpen={() => setActive(p)} />
            </Reveal>
          ))}
        </div>
      ) : (
        <Reveal>
          <Card className="divide-y divide-border p-0">
            {list.map((p) => (
              <button key={p.id} onClick={() => setActive(p)} className="flex w-full items-center gap-4 p-3 text-left transition hover:bg-surface-2">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: `var(--${colorVar[p.image] ?? "accent"})` }}><Icon name="Package" size={20} /></span>
                <div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="text-xs text-fg-subtle">{p.brand} · {p.category}</div></div>
                <Badge tone={condTone[p.condition]}>{p.condition}</Badge>
                <span className="font-semibold tnum">{eur(p.price)}</span>
              </button>
            ))}
          </Card>
        </Reveal>
      )}

      <ProductModal product={active} onClose={() => setActive(null)} onAdd={() => toast.push({ title: "In den Warenkorb", tone: "leaf", icon: "ShoppingBag" })} />
    </div>
  );
}

function ProductCard({ p, onOpen }: { p: Product; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card card-hover w-full overflow-hidden p-0 text-left">
      <div className="relative grid h-28 place-items-center text-white" style={{ background: `linear-gradient(135deg, var(--${colorVar[p.image] ?? "accent"}), color-mix(in oklab, var(--${colorVar[p.image] ?? "accent"}) 45%, transparent))` }}>
        <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
        <Icon name="Package" size={34} />
        <span className="absolute left-2 top-2"><Badge className="border-white/25 bg-white/20 text-white">{p.condition}</Badge></span>
      </div>
      <div className="p-3">
        <div className="text-[11px] text-fg-subtle">{p.brand}</div>
        <div className="line-clamp-1 font-semibold">{p.name}</div>
        <div className="mt-1 flex items-center gap-1 text-xs"><Icon name="Star" size={12} className="text-warning-500" /> {p.rating} <span className="text-fg-subtle">({p.reviews})</span></div>
        <div className="mt-2 text-lg font-bold tnum">{eur(p.price)}</div>
      </div>
    </button>
  );
}

function ProductModal({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: () => void }) {
  const p = product;
  return (
    <Modal open={!!p} onClose={onClose} size="md" title={p?.name}
      footer={<><Button variant="secondary" onClick={onClose}>Schließen</Button><Button onClick={onAdd}><Icon name="ShoppingBag" size={16} /> In den Warenkorb</Button></>}>
      {p && (
        <>
          <div className="relative -mx-5 -mt-5 mb-4 grid h-40 place-items-center text-white" style={{ background: `linear-gradient(135deg, var(--${colorVar[p.image] ?? "accent"}), color-mix(in oklab, var(--${colorVar[p.image] ?? "accent"}) 40%, transparent))` }}>
            <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
            <Icon name="Package" size={48} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Badge tone={condTone[p.condition]}>{p.condition}</Badge><Badge>{p.category}</Badge></div>
            <span className="text-2xl font-bold tnum">{eur(p.price)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2"><RatingStars value={p.rating} size={15} /><span className="text-sm">{p.rating}</span><span className="text-xs text-fg-subtle">· {p.reviews} Bewertungen</span></div>
          <p className="mt-3 text-sm text-fg-muted">Markenprodukt von <span className="font-medium text-fg">{p.brand}</span>. Geprüfter Community-Verkauf mit Käuferschutz und schneller Lieferung.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[{ l: "Zustand", v: p.condition }, { l: "Kategorie", v: p.category }, { l: "Bewertung", v: `${p.rating}★` }].map((x) => (
              <div key={x.l} className="rounded-xl bg-surface-2 p-3"><div className="text-sm font-semibold">{x.v}</div><div className="text-[10px] text-fg-subtle">{x.l}</div></div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
