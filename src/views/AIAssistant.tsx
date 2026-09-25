import { useEffect, useRef, useState } from "react";
import { GitFork, GitPullRequest, Plus, Minus, Send, Sparkles, Star } from "lucide-react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { Donut } from "@/components/charts";
import { Reveal } from "@/components/motion";
import { AVATARS, aiAgents, aiSuggestions, soilRecipes } from "@/mocks/data";
import type { SoilRecipe } from "@/types";

const colorVar: Record<string, string> = { leaf: "accent", soil: "accent-2", info: "info", warning: "warning", danger: "danger" };

export default function AIAssistant() {
  const [tab, setTab] = useState<"chat" | "agents" | "soil">("chat");
  const [agentId, setAgentId] = useState("a1");
  return (
    <div className="space-y-6">
      <PageHeader title="KI-Assistent" subtitle="Spezialisierte Grow-Agenten, Chat & Erdmischungs-Studio." icon="Sparkles"
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: "chat", label: "Chat" }, { value: "agents", label: "Agenten" }, { value: "soil", label: "Mixture-of-Erd's" }]} />} />
      {tab === "chat" && <ChatView agentId={agentId} setAgentId={setAgentId} />}
      {tab === "agents" && <AgentsView onPick={(id) => { setAgentId(id); setTab("chat"); }} />}
      {tab === "soil" && <SoilView />}
    </div>
  );
}

function ChatView({ agentId, setAgentId }: { agentId: string; setAgentId: (id: string) => void }) {
  const agent = aiAgents.find((a) => a.id === agentId) ?? aiAgents[0];
  const [msgs, setMsgs] = useState<{ from: "me" | "them"; text: string }[]>([
    { from: "them", text: "Hallo! Ich bin dein Grow-Mentor. Frag mich alles zu Setup, Düngung oder Klimaführung 🌱" },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const send = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { from: "me", text: q }]);
    setText("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { from: "them", text: "Basierend auf deinen Grow-Daten empfehle ich, die VPD in der Blüte auf 1,2–1,6 kPa zu halten und die Düngung in Woche 6 leicht zu reduzieren. Soll ich einen konkreten Wochenplan erstellen?" }]);
    }, 1300);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Reveal>
        <Card className="p-3">
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Agent wechseln</div>
          <div className="space-y-1">
            {aiAgents.map((a) => (
              <button key={a.id} onClick={() => setAgentId(a.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition", a.id === agentId ? "bg-accent/12" : "hover:bg-surface-2")}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", a.color === "leaf" ? "bg-leaf-500/15 text-leaf-500 dark:text-leaf-400" : a.color === "soil" ? "bg-soil-500/15 text-soil-600 dark:text-soil-300" : a.color === "info" ? "bg-info-500/15 text-info-500 dark:text-info-400" : "bg-warning-500/15 text-warning-500 dark:text-warning-400")}><Icon name={a.icon} size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.name}</span><span className="block truncate text-[11px] text-fg-subtle">{a.role}</span></span>
              </button>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <Card className="flex h-[calc(100dvh-17rem)] min-h-[420px] flex-col p-0 sm:h-[calc(100vh-260px)]">
          <div className="flex items-center gap-3 border-b border-border p-3">
            <span className={cn("grid size-10 place-items-center rounded-xl", agent.color === "leaf" ? "bg-leaf-500/15 text-leaf-500 dark:text-leaf-400" : agent.color === "soil" ? "bg-soil-500/15 text-soil-600 dark:text-soil-300" : agent.color === "info" ? "bg-info-500/15 text-info-500 dark:text-info-400" : "bg-warning-500/15 text-warning-500 dark:text-warning-400")}><Icon name={agent.icon} size={20} /></span>
            <div><div className="font-semibold">{agent.name}</div><div className="text-xs text-leaf-500 dark:text-leaf-400">● Online · {agent.uses.toLocaleString("de-DE")} Gespräche</div></div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="KI-Konversation">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.from === "me" ? "justify-end" : "justify-start")}>
                {m.from === "them" && <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><Sparkles className="size-4" /></span>}
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", m.from === "me" ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm bg-surface-2 text-fg")}>{m.text}</div>
              </div>
            ))}
            {typing && (
              <div className="flex gap-2">
                <span className="mt-1 grid size-7 place-items-center rounded-lg bg-accent/12 text-accent"><Sparkles className="size-4" /></span>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
                  {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {aiSuggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-fg-muted transition hover:border-accent/40 hover:text-accent">{s}</button>)}
            </div>
            <div className="flex items-center gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(text)} placeholder="Frag den KI-Assistenten…" className="h-11 flex-1 rounded-xl border border-border bg-surface-2 px-4 text-sm outline-none focus:border-accent" />
              <button onClick={() => send(text)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:brightness-110" aria-label="Senden"><Send className="size-5" /></button>
            </div>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

function AgentsView({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {aiAgents.map((a, i) => (
        <Reveal key={a.id} delay={i * 0.05}>
          <Card className="flex h-full flex-col p-5">
            <span className={cn("grid size-12 place-items-center rounded-xl", a.color === "leaf" ? "bg-leaf-500/15 text-leaf-500 dark:text-leaf-400" : a.color === "soil" ? "bg-soil-500/15 text-soil-600 dark:text-soil-300" : a.color === "info" ? "bg-info-500/15 text-info-500 dark:text-info-400" : "bg-warning-500/15 text-warning-500 dark:text-warning-400")}><Icon name={a.icon} size={24} /></span>
            <div className="mt-3 font-semibold">{a.name}</div>
            <div className="text-xs text-accent">{a.role}</div>
            <p className="mt-2 flex-1 text-sm text-fg-muted">{a.desc}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-fg-subtle">
              <span className="flex items-center gap-1"><Star className="size-3 fill-warning-500 text-warning-500" /> {a.rating}</span>
              <span>{a.uses.toLocaleString("de-DE")} Nutzer</span>
            </div>
            <Button className="mt-3 w-full" variant="secondary" onClick={() => onPick(a.id)}>Starten</Button>
          </Card>
        </Reveal>
      ))}
    </div>
  );
}

function SoilView() {
  const [sel, setSel] = useState<SoilRecipe | null>(soilRecipes[0]);
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Reveal>
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Rezepte</span>
            <button className="text-accent hover:underline"><Plus className="size-4" /></button>
          </div>
          <div className="space-y-1">
            {soilRecipes.map((r) => (
              <button key={r.id} onClick={() => setSel(r)} className={cn("w-full rounded-xl p-3 text-left transition", sel?.id === r.id ? "bg-accent/12" : "hover:bg-surface-2")}>
                <div className="flex items-center justify-between"><span className="truncate font-mono text-sm font-medium">{r.name}</span>{r.base !== "main" && <Badge tone="info" className="font-mono">fork</Badge>}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-fg-subtle">
                  <span className="flex items-center gap-1"><Star className="size-3 fill-warning-500 text-warning-500" /> {r.stars}</span>
                  <span className="flex items-center gap-1"><GitFork className="size-3" /> {r.forks}</span>
                  <span className="flex items-center gap-1"><Icon name="Users" size={12} /> {r.contributors}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        {sel ? <RecipeDetail r={sel} /> : <EmptyState icon="Code2" title="Kein Rezept gewählt" desc="Wähle links ein Living-Soil-Rezept." />}
      </Reveal>
    </div>
  );
}

/** Berechnet den Komponenten-Diff eines Rezepts gegenüber seiner Basis (Living-Soil-Git-Stil). */
function diffRecipes(base: SoilRecipe, recipe: SoilRecipe) {
  const baseMap = new Map(base.components.map((c) => [c.name, c.pct]));
  const recipeNames = new Set(recipe.components.map((c) => c.name));
  return {
    added: recipe.components.filter((c) => !baseMap.has(c.name)).map((c) => `${c.name} ${c.pct}%`),
    changed: recipe.components
      .filter((c) => baseMap.has(c.name) && baseMap.get(c.name) !== c.pct)
      .map((c) => `${c.name} ${baseMap.get(c.name)}% → ${c.pct}%`),
    removed: base.components.filter((c) => !recipeNames.has(c.name)).map((c) => `${c.name} ${c.pct}%`),
  };
}

function RecipeDetail({ r }: { r: SoilRecipe }) {
  const toast = useToast();
  const donutData = r.components.map((c) => ({ label: c.name, value: c.pct, color: `var(--${colorVar[c.color] ?? "accent"})` }));
  const baseRecipe = r.base !== "main" ? soilRecipes.find((s) => s.name === r.base) : undefined;
  const diff = baseRecipe ? diffRecipes(baseRecipe, r) : null;
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h2 className="font-mono text-lg font-semibold">{r.name}</h2>{r.base !== "main" && <Badge tone="info" className="font-mono">fork of {r.base}</Badge>}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-fg-subtle"><Avatar src={r.avatar} size={22} /> {r.author} · aktualisiert {r.updated}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => toast.push({ title: "Fork erstellt", desc: `${r.name} wurde geforkt.`, tone: "info", icon: "GitFork" })}><GitFork className="size-4" /> Fork</Button>
          <Button size="sm" onClick={() => toast.push({ title: "Pull-Request geöffnet", tone: "leaf", icon: "GitPullRequest" })}><GitPullRequest className="size-4" /> Pull Request</Button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-4">
            <Donut data={donutData} size={120} stroke={14}>
              <div><div className="text-[10px] text-fg-subtle">EC</div><div className="text-base font-bold tnum">{r.ec}</div></div>
            </Donut>
            <div className="flex-1 space-y-1.5">
              {r.components.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 rounded-full" style={{ background: `var(--${colorVar[c.color] ?? "accent"})` }} />
                  <span className="flex-1 text-fg-muted">{c.name}</span>
                  <span className="font-medium tnum">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{r.ph}</div><div className="text-[10px] text-fg-subtle">pH-Wert</div></div>
            <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{r.contributors}</div><div className="text-[10px] text-fg-subtle">Contributors</div></div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-fg-subtle"><span className="font-mono">{r.base === "main" ? "main" : `${r.base} → ${r.name}`}</span><span>Diff</span></div>
          <div className="overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] font-mono text-xs">
            {diff ? (
              <>
                {diff.added.map((line, i) => <div key={`a${i}`} className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-leaf-600 dark:text-leaf-400"><Plus className="size-3 shrink-0" /> {line}</div>)}
                {diff.changed.map((line, i) => <div key={`c${i}`} className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-warning-500"><Icon name="GitCommit" size={13} className="shrink-0" /> {line}</div>)}
                {diff.removed.map((line, i) => <div key={`r${i}`} className="flex items-center gap-2 px-3 py-1.5 text-danger"><Minus className="size-3 shrink-0" /> {line}</div>)}
                {diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0 && <div className="px-3 py-3 text-fg-subtle">Keine Änderungen zur Basis.</div>}
              </>
            ) : (
              <div className="px-3 py-3 text-fg-subtle">Basis-Rezept (keine Ableitung).</div>
            )}
          </div>
          <div className="mt-3">
            <div className="mb-1.5 text-xs text-fg-subtle">Contributors</div>
            <div className="flex -space-x-2">{AVATARS.slice(0, r.contributors > 4 ? 5 : r.contributors).map((src, i) => <Avatar key={i} src={src} size={26} className="ring-2 ring-surface" />)}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
