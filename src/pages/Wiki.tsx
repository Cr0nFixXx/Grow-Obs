import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, SearchInput, SkeletonCard, Tabs } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useWikiArticles } from "@/data/hooks";
import { useServices } from "@/data/DataContext";
import { AVATARS, wikiCategories } from "@/mocks/data";
import type { WikiArticleDetail } from "@/services/interfaces";

function useWikiArticle(articleId?: string) {
  const svc = useServices();
  const [data, setData] = useState<WikiArticleDetail | null>(null);
  const [loading, setLoading] = useState(!!articleId);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const res = await svc.wiki.get(articleId);
      setData(res ?? null);
      if (!res) setError("Artikel nicht gefunden");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [svc, articleId]);
  useEffect(() => { void load(); }, [load]);
  return { article: data, loading, error, refresh: load };
}

export default function Wiki() {
  const { params } = useNav();
  const { articleId } = params ?? {};
  const listHook = useWikiArticles();
  const detail = useWikiArticle(articleId);

  if (!articleId) {
    if (listHook.loading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
    if (listHook.error) return <EmptyState icon="AlertTriangle" title="Wiki nicht geladen" desc={listHook.error} />;
    return <WikiList />;
  }

  if (detail.loading) return <SkeletonCard className="mx-auto max-w-3xl" />;
  if (detail.error || !detail.article) return <EmptyState icon="AlertTriangle" title="Artikel nicht gefunden" desc={detail.error ?? "Kein Inhalt."} />;
  return <Reader a={detail.article} />;
}

function WikiList() {
  const { navigate } = useNav();
  const { articles } = useWikiArticles();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Übersicht");
  const list = articles.filter(
    (a) => (cat === "Übersicht" || a.category === cat) && `${a.title} ${a.excerpt}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Wiki & Wissensbibliothek" subtitle="Community-gepflegtes Wissen – editierbar wie ein Code-Repo." icon="BookOpen"
        actions={<Button variant="secondary"><Pencil className="size-4" /> Artikel erstellen</Button>} />
      <Reveal>
        <Card className="space-y-3 p-4">
          <SearchInput placeholder="Artikel durchsuchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Tabs value={cat} onChange={setCat} tabs={wikiCategories.map((c) => ({ value: c, label: c }))} />
        </Card>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a, i) => (
          <Reveal key={a.id} delay={i * 0.04}>
            <button onClick={() => navigate("wiki", { articleId: a.id })} className="card card-hover h-full w-full overflow-hidden p-0 text-left">
              <div className="relative grid h-28 place-items-center bg-gradient-to-br from-leaf-600/80 to-leaf-900 text-white">
                <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
                <Icon name="BookOpen" size={30} />
                <span className="absolute right-2 top-2"><Badge className="border-white/25 bg-white/20 text-white">{a.category}</Badge></span>
              </div>
              <div className="p-4">
                <div className="font-semibold">{a.title}</div>
                <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{a.excerpt}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-fg-subtle">
                  <span>{a.author} · {a.readMin} Min</span>
                  <span className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono">{a.version}</span>
                </div>
              </div>
            </button>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function Reader({ a }: { a: WikiArticleDetail }) {
  const { back } = useNav();
  const toast = useToast();
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg">
        <Icon name="ArrowLeft" size={16} /> Zurück zur Bibliothek
      </button>
      <Reveal>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="leaf">{a.category}</Badge>
            <Badge tone="info" className="font-mono">{a.version}</Badge>
            <span className="text-xs text-fg-subtle">aktualisiert {a.updated}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{a.title}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-fg-subtle">
            <Avatar src={AVATARS[3]} size={28} /> von {a.author} · {a.readMin} Min Lesezeit
          </div>
        </div>
      </Reveal>
      <Reveal>
        <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-leaf-600/70 to-leaf-900">
          <div className="absolute inset-0 grain opacity-20 mix-blend-overlay" />
          <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white/90"><Icon name="BookOpen" /> Grow|Wiki</div>
        </div>
      </Reveal>
      <Reveal>
        <div className="space-y-4 text-[15px] leading-relaxed text-fg/90">
          {a.body.map((p, i) => (<p key={i} className={i === 0 ? "text-lg text-fg" : ""}>{p}</p>))}
        </div>
      </Reveal>
      <Reveal>
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {a.tags.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg-muted">#{t}</span>)}
          </div>
          <Button variant="secondary" onClick={() => toast.push({ title: "Editor geöffnet", desc: "Bearbeitung läuft im Fork-Modus.", tone: "info", icon: "Pencil" })}>
            <Pencil className="size-4" /> Bearbeiten
          </Button>
        </Card>
      </Reveal>
      <Reveal>
        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-semibold">Mitwirkende</div>
            <div className="mt-1 flex -space-x-2">
              {AVATARS.slice(0, 4).map((src, i) => <Avatar key={i} src={src} size={28} className="ring-2 ring-surface" />)}
            </div>
          </div>
          <div className="text-right text-xs text-fg-subtle">
            <div className="flex items-center gap-1"><Icon name="GitCommit" size={14} /> 28 Commits</div>
            <div className="mt-0.5">zuletzt von {a.author}</div>
          </div>
        </Card>
      </Reveal>
    </article>
  );
}