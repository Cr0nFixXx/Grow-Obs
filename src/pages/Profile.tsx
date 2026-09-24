import { useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Segmented, Toggle } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { activityFeed, currentUser } from "@/mocks/data";

const badges = [
  { icon: "Trophy", label: "Erste Ernte", tone: "warning" },
  { icon: "Sprout", label: "10 Grows", tone: "leaf" },
  { icon: "Users", label: "1k Follower", tone: "info" },
  { icon: "Leaf", label: "Living Soiler", tone: "soil" },
  { icon: "Flame", label: "100 Tage Streak", tone: "danger" },
  { icon: "BrainCircuit", label: "KI-Pionier", tone: "leaf" },
];

export default function Profile() {
  const { navigate } = useNav();
  const { theme, setTheme, particles, setParticles } = useTheme();
  const { locale, setLocale, currency, setCurrency, money, t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<"profil" | "settings">("profil");
  const [prefs, setPrefs] = useState({ push: true, telegram: currentUser.telegram, weekly: true, sound: false });

  return (
    <div className="space-y-6">
      <PageHeader title="Profil & Einstellungen" subtitle="Verwalte Konto, Präferenzen und Darstellung." icon="Settings" />

      {/* Identity */}
      <Reveal>
        <Card className="overflow-hidden p-0">
          <div className="h-28 bg-gradient-to-br from-leaf-600/70 to-leaf-950" />
          <div className="px-5 pb-5">
            <div className="-mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <Avatar src={currentUser.avatar} size={84} className="ring-4 ring-surface" />
                <div className="pb-1">
                  <div className="flex items-center gap-2 text-xl font-bold">{currentUser.name} <Badge tone="leaf">Lvl {currentUser.level}</Badge></div>
                  <div className="text-sm text-fg-subtle">{currentUser.handle} · {currentUser.title}</div>
                </div>
              </div>
              <Button variant="secondary" onClick={() => toast.push({ title: "Profil bearbeiten", desc: "Editor öffnet im Demo-Modus.", tone: "info", icon: "Pencil" })}><Icon name="Pencil" size={16} /> Bearbeiten</Button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[{ l: "Grows", v: currentUser.grows }, { l: "Ernten", v: currentUser.harvests }, { l: "Follower", v: currentUser.followers }].map((s) => (
                <div key={s.l} className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{s.v.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">{s.l}</div></div>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      <Segmented value={tab} onChange={setTab} options={[{ value: "profil", label: "Profil" }, { value: "settings", label: "Einstellungen" }]} />

      {tab === "profil" && (
        <>
          <Reveal>
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">Abzeichen</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {badges.map((b) => (
                  <div key={b.label} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", b.tone === "leaf" ? "bg-leaf-500/12 text-leaf-500 dark:text-leaf-400" : b.tone === "soil" ? "bg-soil-500/12 text-soil-600 dark:text-soil-300" : b.tone === "info" ? "bg-info-500/12 text-info-500 dark:text-info-400" : b.tone === "danger" ? "bg-danger-500/12 text-danger-500 dark:text-danger-400" : "bg-warning-500/12 text-warning-500 dark:text-warning-400")}><Icon name={b.icon} size={18} /></span>
                    <span className="text-sm font-medium">{b.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
          <Reveal delay={0.05}>
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">Letzte Aktivität</h2>
              <div className="space-y-1">
                {activityFeed.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                    <Avatar src={a.avatar} size={32} />
                    <span className="min-w-0 flex-1 text-sm"><span className="text-fg-muted">{a.who} {a.action} </span><span className="font-medium">{a.target}</span></span>
                    <span className="text-xs text-fg-subtle">{a.time}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        </>
      )}

      {tab === "settings" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-fg-muted">{t("settings.appearance")}</h2>
              <Field label="Design"><div className="flex gap-2">{([["light", "Hell", Sun], ["dark", "Dunkel", Moon]] as const).map(([val, label, Ico]) => (
                <button key={val} onClick={() => setTheme(val)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition", theme === val ? "border-accent bg-accent/10 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}><Ico className="size-4" /> {label}</button>
              ))}</div></Field>
              <ToggleRow label="Animationen reduzieren" desc="Berücksichtigt prefers-reduced-motion" checked={false} onChange={() => toast.push({ title: "Systemeinstellung", tone: "info", icon: "Info" })} />
              <ToggleRow label="Partikel-Effekte" desc="Schwebende Sporen im Hintergrund" checked={particles} onChange={setParticles} />
            </Card>
          </Reveal>
          <Reveal delay={0.04}>
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-fg-muted">{t("settings.language")} & {t("settings.currency")}</h2>
              <Field label={t("settings.language")}>
                <div className="flex gap-2">
                  {([["de", "Deutsch"], ["en", "English"]] as const).map(([code, label]) => (
                    <button key={code} onClick={() => setLocale(code)} className={cn("flex-1 rounded-xl border p-3 text-sm font-medium transition", locale === code ? "border-accent bg-accent/10 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}>{label}</button>
                  ))}
                </div>
              </Field>
              <Field label={t("settings.currency")}>
                <div className="flex gap-2">
                  {([["EUR", "€ EUR"], ["USD", "$ USD"]] as const).map(([code, label]) => (
                    <button key={code} onClick={() => setCurrency(code)} className={cn("flex-1 rounded-xl border p-3 text-sm font-medium transition", currency === code ? "border-accent bg-accent/10 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}>{label}</button>
                  ))}
                </div>
              </Field>
              <div className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">{t("demo.cost")}: <span className="font-semibold tnum text-fg">{money(168)}</span></div>
            </Card>
          </Reveal>
          <Reveal delay={0.05}>
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-fg-muted">{t("settings.notifications")}</h2>
              <ToggleRow label="Push-Benachrichtigungen" desc="Tasks & KI-Empfehlungen" checked={prefs.push} onChange={(v) => setPrefs((p) => ({ ...p, push: v }))} />
              <ToggleRow label="Telegram-Bot" desc="Status via Telegram" checked={prefs.telegram} onChange={(v) => setPrefs((p) => ({ ...p, telegram: v }))} />
              <ToggleRow label="Wöchentlicher Report" desc="Jeden Sonntag um 18 Uhr" checked={prefs.weekly} onChange={(v) => setPrefs((p) => ({ ...p, weekly: v }))} />
              <ToggleRow label="Sounds" desc="Akustische Signale" checked={prefs.sound} onChange={(v) => setPrefs((p) => ({ ...p, sound: v }))} />
            </Card>
          </Reveal>
          <Reveal delay={0.1}>
            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-fg-muted">Konto</h2>
              <Field label="Anzeigename"><Input defaultValue={currentUser.name} /></Field>
              <Field label="E-Mail"><Input defaultValue="max@growobserver.app" /></Field>
              <Button variant="secondary" className="w-full" onClick={() => navigate("telegram")}><Icon name="Send" size={16} /> Telegram verknüpfen</Button>
              <Button variant="ghost" className="w-full text-danger hover:bg-danger/10" onClick={() => navigate("auth")}><LogOut className="size-4" /> Abmelden</Button>
            </Card>
          </Reveal>
          <Reveal delay={0.15}>
            <Card className="space-y-2 border-danger/30 p-5">
              <h2 className="text-sm font-semibold text-danger">Gefahrenzone</h2>
              <p className="text-sm text-fg-muted">Lösche dein Konto unwiderruflich inkl. aller Grows & Daten.</p>
              <Button variant="danger" onClick={() => toast.push({ title: "Bestätigung nötig", desc: "Demo – keine Löschung.", tone: "danger", icon: "AlertTriangle" })}>Konto löschen</Button>
            </Card>
          </Reveal>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-fg-subtle">{desc}</div></div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
