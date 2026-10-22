import { useEffect, useRef, useState } from "react";
import { useSwipeTabs } from "@/lib/gestures";

const profileTabs = ["profil", "settings"] as const;
import { LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNav } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, CollapsibleCard, Field, Input, Modal, PageHeader, Segmented, Toggle } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { UpdateSettingsCard } from "@/components/UpdateUI";
import { AccountSecurity } from "@/components/AccountSecurity";
import { PushCard } from "@/components/PushCard";
import { Reveal } from "@/components/motion";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { useActivity } from "@/data/hooks";
import { config } from "@/lib/config";
import { playSound } from "@/lib/sound";

export default function Profile() {
  const currentUser = useCurrentUser();
  const { navigate, params, replaceParams } = useNav();
  const { theme, setTheme, particles, setParticles, reduceMotion, setReduceMotion, sound, setSound } = useTheme();
  const { locale, setLocale, currency, setCurrency, money, t } = useI18n();
  const toast = useToast();
  const { logout, updateProfile } = useAuth();
  const me = currentUser;
  const isGuest = me.id === "guest";
  const { activity } = useActivity();
  const [tab, setTabState] = useState<"profil" | "settings">(params?.tab === "settings" ? "settings" : "profil");
  const setTab = (next: "profil" | "settings") => { setTabState(next); replaceParams(next === "settings" ? { tab: next } : null); };
  useEffect(() => { setTabState(params?.tab === "settings" ? "settings" : "profil"); }, [params?.tab]);
  const [editing, setEditing] = useState(false);
  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipeTabs(swipeRef, profileTabs, tab, setTab);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const setWeekly = async (value: boolean) => {
    setWeeklySaving(true);
    try {
      await updateProfile({ weeklyReport: value });
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: error instanceof Error ? error.message : "Bitte noch einmal versuchen.", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setWeeklySaving(false);
    }
  };

  return (
    <div ref={swipeRef} className="space-y-6">
      {!isGuest && editing && <EditProfileModal open={editing} onClose={() => setEditing(false)} />}
      <PageHeader title="Profil & Einstellungen" subtitle="Verwalte Konto, Präferenzen und Darstellung." icon="Settings" />

      {/* Identity */}
      <Reveal>
        <Card className="overflow-hidden p-0">
          <div className="h-28 bg-gradient-to-br from-leaf-600/70 to-leaf-950" />
          <div className="px-5 pb-5">
            <div className="-mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <Avatar src={me.avatar} name={me.name} size={84} className="ring-4 ring-surface" />
                <div className="pb-1">
                  <div className="flex items-center gap-2 text-xl font-bold">{me.name} <Badge tone="leaf">Lvl {me.level}</Badge></div>
                  <div className="text-sm text-fg-subtle">{me.handle} · {me.title}</div>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setEditing(true)}><Icon name="Pencil" size={16} /> Bearbeiten</Button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[{ l: "Grows", v: me.grows }, { l: "Ernten", v: me.harvests }, { l: "Follower", v: me.followers }].map((s) => (
                <div key={s.l} className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{s.v.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">{s.l}</div></div>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      <Segmented value={tab} onChange={setTab} options={[{ value: "profil", label: "Profil" }, { value: "settings", label: "Einstellungen" }]} />

      {tab === "profil" && (
        <>
          <Reveal delay={0.05}>
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg-muted">Letzte Aktivität</h2>
              <div className="space-y-1">
                {activity.length === 0 && <p className="py-4 text-center text-sm text-fg-subtle">Noch keine Aktivität.</p>}
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                    <Avatar src={a.avatar} name={a.who} size={32} />
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
          <Reveal className="lg:col-span-2">
            <UpdateSettingsCard />
          </Reveal>
          <Reveal>
            <CollapsibleCard icon="SunMedium" title={t("settings.appearance")} className="p-5" bodyClassName="space-y-4">
              <Field label="Design"><div className="flex gap-2">{([["light", "Hell", Sun], ["dark", "Dunkel", Moon]] as const).map(([val, label, Ico]) => (
                <button key={val} onClick={() => setTheme(val)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition", theme === val ? "border-accent bg-accent/10 text-accent" : "border-border text-fg-muted hover:bg-surface-2")}><Ico className="size-4" /> {label}</button>
              ))}</div></Field>
              <ToggleRow label="Animationen reduzieren" desc="Weniger Bewegung, nur dieses Gerät. Ohne eigene Wahl gilt die Systemeinstellung." checked={reduceMotion} onChange={setReduceMotion} />
              <ToggleRow label="Partikel-Effekte" desc="Schwebende Sporen im Hintergrund" checked={particles} onChange={setParticles} />
              <ToggleRow label="Sounds" desc="Kurzer Ton bei neuer Nachricht oder Meldung, solange die App offen ist (nur dieses Gerät)" checked={sound} onChange={(v) => { setSound(v); if (v) playSound("preview"); }} />
            </CollapsibleCard>
          </Reveal>
          <Reveal delay={0.04}>
            <CollapsibleCard icon="Globe" title={`${t("settings.language")} & ${t("settings.currency")}`} className="p-5" bodyClassName="space-y-4">
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
            </CollapsibleCard>
          </Reveal>
          <Reveal delay={0.05}>
            <CollapsibleCard icon="Bell" title={t("settings.notifications")} className="p-5" bodyClassName="space-y-4">
              <ToggleRow
                label="Wochenreport"
                desc={config.useMock ? "Im Demo-Modus nicht verfügbar (braucht einen Server)." : "Sonntagabend: Stand deiner Grows als Meldung in der App, per Push, wenn aktiv."}
                checked={!!me.weeklyReport}
                disabled={isGuest || config.useMock || weeklySaving}
                onChange={(v) => void setWeekly(v)}
              />
            </CollapsibleCard>
          </Reveal>
          <Reveal delay={0.07}><PushCard /></Reveal>
          <Reveal delay={0.1}>
            <CollapsibleCard icon="User" title="Konto" className="p-5" bodyClassName="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                <Avatar src={me.avatar} name={me.name} size={40} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{me.name}</div><div className="truncate text-xs text-fg-subtle">{me.handle} · {me.title}</div></div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Ändern</Button>
              </div>
              <Button variant="secondary" className="w-full" onClick={() => navigate("telegram")}><Icon name="Send" size={16} /> Telegram verknüpfen</Button>
              <Button variant="ghost" className="w-full text-danger hover:bg-danger/10" onClick={() => { logout(); navigate("auth"); }}><LogOut className="size-4" /> Abmelden</Button>
            </CollapsibleCard>
          </Reveal>
          {!isGuest && (
            <Reveal delay={0.12}>
              <AccountSecurity onSignedOut={() => navigate("auth")} />
            </Reveal>
          )}
          <Reveal delay={0.15}>
            <CollapsibleCard icon="AlertTriangle" tone="danger" title="Gefahrenzone" className="border-danger/30 p-5" bodyClassName="space-y-2">
              <p className="text-sm text-fg-muted">Lösche dein Konto unwiderruflich inkl. aller Grows & Daten.</p>
              <Button variant="danger" onClick={() => toast.push({ title: "Bestätigung nötig", desc: "Demo – keine Löschung.", tone: "danger", icon: "AlertTriangle" })}>Konto löschen</Button>
            </CollapsibleCard>
          </Reveal>
        </div>
      )}
    </div>
  );
}

function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useCurrentUser();
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const nameError = name.trim().length < 2 ? "Mindestens 2 Zeichen." : "";
  const save = async () => {
    if (nameError) return;
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), title: title.trim() || "Grower", avatar });
      toast.push({ title: "Profil gespeichert", tone: "leaf", icon: "CheckCircle2" });
      onClose();
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: error instanceof Error ? error.message : "Unbekannter Fehler", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Profil bearbeiten"
      footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={save} loading={busy} disabled={!!nameError}>Speichern</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar src={avatar} name={me.name} size={72} />
          <div className="flex flex-wrap gap-2">
            <ImagePickButton onUploaded={setAvatar} label="Profilbild ändern" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-surface-2">
              <Icon name="Camera" size={16} /> Bild wählen
            </ImagePickButton>
            {avatar && <Button size="sm" variant="ghost" onClick={() => setAvatar("")}>Entfernen</Button>}
          </div>
        </div>
        <Field label="Anzeigename"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-invalid={!!nameError} /></Field>
        {nameError && <p role="alert" className="text-xs font-medium text-danger">{nameError}</p>}
        <Field label="Titel" hint="z. B. Living-Soil-Fan"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} /></Field>
      </div>
    </Modal>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-fg-subtle">{desc}</div></div>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}
