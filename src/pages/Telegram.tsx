import { useState } from "react";
import { cn } from "@/utils/cn";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field, Input, PageHeader, Toggle } from "@/components/ui";
import { Reveal } from "@/components/motion";

export default function Telegram() {
  const toast = useToast();
  const [connected, setConnected] = useState(true);
  const [opts, setOpts] = useState({ tasks: true, ai: true, shop: true, daily: false });

  return (
    <div className="space-y-6">
      <PageHeader title="Telegram-Integration" subtitle="Bot verknüpfen, Auth-Status prüfen & Benachrichtigungen einrichten." icon="Send" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connection */}
        <Reveal>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-xl bg-[#2AABEE] text-white"><span className="text-xl font-bold">T</span></span>
                <div>
                  <div className="font-semibold">@GrowObserverBot</div>
                  <div className="text-xs text-fg-subtle">Offizieller Community-Bot</div>
                </div>
              </div>
              <Badge tone={connected ? "leaf" : "warning"}>{connected ? "Verbunden" : "Getrennt"}</Badge>
            </div>

            {connected ? (
              <div className="mt-5 rounded-xl bg-leaf-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-leaf-700 dark:text-leaf-300"><Icon name="ShieldCheck" size={16} /> Authentifiziert</div>
                <p className="mt-1 text-sm text-fg-muted">Verbunden als <span className="font-medium">@max_grows</span>. Token gültig bis 12.06.2026.</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setConnected(false)}>Trennen</Button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <Field label="Bot-Token" hint="Erhalte ihn via /newbot bei @BotFather"><Input placeholder="123456:ABC-DEF…" defaultValue="••••••••••••••••••••" /></Field>
                <Button className="w-full" onClick={() => { setConnected(true); toast.push({ title: "Bot verbunden", desc: "Telegram ist nun aktiv.", tone: "leaf", icon: "Send" }); }}>Bot verbinden</Button>
              </div>
            )}

            <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"><Icon name="QrCode" size={34} /></div>
              <div className="text-sm text-fg-muted">Scanne den QR-Code mit Telegram, um den Bot sofort zu öffnen und dich anzumelden.</div>
            </div>
          </Card>
        </Reveal>

        {/* Options */}
        <Reveal delay={0.05}>
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-fg-muted">Benachrichtigungen</h2>
            {[
              { key: "tasks" as const, label: "Tasks & Erinnerungen", desc: "Fällige Aufgaben & Termine" },
              { key: "ai" as const, label: "KI-Empfehlungen", desc: "VPD- & Klima-Warnungen" },
              { key: "shop" as const, label: "Angebote", desc: "Neue Seed-Deals" },
              { key: "daily" as const, label: "Tägliche Zusammenfassung", desc:"Jeden Morgen um 8 Uhr" },
            ].map((o) => (
              <div key={o.key} className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-medium">{o.label}</div><div className="text-xs text-fg-subtle">{o.desc}</div></div>
                <Toggle checked={opts[o.key]} onChange={(v) => setOpts((p) => ({ ...p, [o.key]: v }))} label={o.label} />
              </div>
            ))}
            <div className={cn("mt-2 rounded-xl p-3 text-sm", connected ? "bg-surface-2 text-fg-muted" : "bg-warning-500/10 text-warning-600 dark:text-warning-400")}>
              {connected ? "Der Bot antwortet innerhalb von Sekunden auf deine Nachrichten." : "Verbinde den Bot, um Benachrichtigungen zu aktivieren."}
            </div>
          </Card>
        </Reveal>
      </div>

      {/* Chat preview */}
      <Reveal delay={0.1}>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">Bot-Vorschau</h2>
          <div className="max-w-md space-y-2">
            <div className="flex justify-end"><div className="rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-fg">/status HazyDream</div></div>
            <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2 text-sm">🌿 HazyDream · Run 03 — Tag 64/98 · Blüte · Gesundheit 94 %. Nächster Task: Komposttee heute 18 Uhr.</div></div>
            <div className="flex justify-end"><div className="rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-fg">/angebote</div></div>
            <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2 text-sm">🔥 Northern Haze jetzt 54 € (−20 %) bei SeedHub. Gelato 41 64 € (−11 %).</div></div>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
