import { useState } from "react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Chip, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { useNotifications } from "@/data/hooks";

const typeIcon: Record<string, string> = { ai: "Sparkles", shop: "ShoppingBag", forum: "MessagesSquare", task: "ListChecks", grow: "Sprout", system: "Info" };
const typeTone: Record<string, "leaf" | "info" | "warning" | "soil"> = { ai: "leaf", shop: "warning", forum: "info", task: "warning", grow: "soil", system: "info" };
const filters = ["Alle", "Ungelesen", "KI", "Forum", "Shop", "Tasks"];

export default function Notifications() {
  const toast = useToast();
  const { items: raw, loading, error, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState("Alle");

  const list = raw.filter((n) => {
    if (filter === "Alle") return true;
    if (filter === "Ungelesen") return !n.read;
    if (filter === "KI") return n.type === "ai";
    if (filter === "Forum") return n.type === "forum";
    if (filter === "Shop") return n.type === "shop";
    if (filter === "Tasks") return n.type === "task";
    return true;
  });

  const unread = raw.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }
  if (error) return <EmptyState icon="AlertTriangle" title="Benachrichtigungen nicht geladen" desc={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Benachrichtigungen" subtitle={`${unread} ungelesen · bleib auf dem Laufenden.`} icon="Bell"
        actions={<Button variant="secondary" onClick={markAllRead} disabled={unread === 0}><Icon name="CheckCircle2" size={16} /> Alle gelesen</Button>} />

      <Reveal>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}
        </div>
      </Reveal>

      {list.length === 0 ? (
        <Reveal><EmptyState icon="Bell" title="Alles erledigt" desc="Keine Benachrichtigungen in dieser Ansicht." /></Reveal>
      ) : (
        <div className="space-y-2">
          {list.map((n, i) => (
            <Reveal key={n.id} delay={i * 0.03}>
              <button
                onClick={() => { void markRead(n.id); toast.push({ title: n.title, desc: n.body, tone: typeTone[n.type], icon: typeIcon[n.type] }); }}
                className={cn("card flex w-full items-start gap-3 p-4 text-left transition hover:elev-2", !n.read && "border-accent/25 bg-accent/[0.04]")}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", typeTone[n.type] === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : typeTone[n.type] === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : typeTone[n.type] === "warning" ? "bg-warning-500/12 text-warning-500 dark:text-warning-400" : "bg-soil-500/12 text-soil-600 dark:text-soil-300")}>
                  <Icon name={typeIcon[n.type]} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="font-medium">{n.title}</span>{!n.read && <span className="size-2 rounded-full bg-accent" />}</span>
                  <span className="block text-sm text-fg-muted">{n.body}</span>
                  <span className="mt-1 block text-xs text-fg-subtle">{n.time}</span>
                </span>
                <Badge>{n.type}</Badge>
              </button>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
