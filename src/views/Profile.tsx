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
import { Avatar, Badge, Button, Card, Chip, CollapsibleCard, Field, Input, Modal, PageHeader, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import { ImagePickButton } from "@/components/media";
import { UpdateSettingsCard } from "@/components/UpdateUI";
import { AccountSecurity } from "@/components/AccountSecurity";
import { AccountData } from "@/components/AccountData";
import { PushCard } from "@/components/PushCard";
import { atHandle, FollowListModal, FollowRequestsCard, ProfileBanner } from "@/components/members";
import { GROW_SINCE_MIN, INTERESTS, INTERESTS_MAX, MEDIA, BIO_MAX, LOCATION_MAX, HANDLE_COOLDOWN_DAYS, HANDLE_PATTERN } from "@/lib/profile-fields";
import type { ProfileVisibility } from "@/services/interfaces";
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
  const { logout, updateProfile, refreshUser } = useAuth();
  const me = currentUser;
  const isGuest = me.id === "guest";
  const { activity } = useActivity();
  const [tab, setTabState] = useState<"profil" | "settings">(params?.tab === "settings" ? "settings" : "profil");
  const setTab = (next: "profil" | "settings") => { setTabState(next); replaceParams(next === "settings" ? { tab: next } : null); };
  useEffect(() => { setTabState(params?.tab === "settings" ? "settings" : "profil"); }, [params?.tab]);
  const [editing, setEditing] = useState(false);
  const [list, setList] = useState<"followers" | "following" | null>(null);
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

  const [reminderSaving, setReminderSaving] = useState(false);
  const setReminder = async (days: number | null) => {
    setReminderSaving(true);
    try {
      await updateProfile({ growReminderDays: days });
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: error instanceof Error ? error.message : "Bitte noch einmal versuchen.", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setReminderSaving(false);
    }
  };

  return (
    <div ref={swipeRef} className="space-y-6">
      {!isGuest && editing && <EditProfileModal open={editing} onClose={() => setEditing(false)} />}
      {!isGuest && list && <FollowListModal open onClose={() => setList(null)} handle={me.handle} kind={list} mine />}
      <PageHeader title="Profil & Einstellungen" subtitle="Verwalte Konto, Präferenzen und Darstellung." icon="Settings" />

      {/* Identity */}
      <Reveal>
        <Card className="overflow-hidden p-0">
          <ProfileBanner src={me.cover} className="h-28 sm:h-36" />
          <div className="px-5 pb-5">
            <div className="-mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-4">
                <Avatar src={me.avatar} name={me.name} size={84} className="shrink-0 ring-4 ring-surface" />
                {/* Der Avatar ragt 40 px ins Titelbild; Name und Handle starten klar darunter (B-90). */}
                <div className="min-w-0 pt-14">
                  <div className="text-xl font-bold">{me.name}</div>
                  <div className="text-sm text-fg-subtle">{atHandle(me.handle)} · {me.title}</div>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setEditing(true)}><Icon name="Pencil" size={16} /> Bearbeiten</Button>
            </div>
            {me.bio && <p className="mt-4 whitespace-pre-line text-sm">{me.bio}</p>}
            <ProfileFacts me={me} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{me.grows.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Grows</div></div>
              <div className="rounded-xl bg-surface-2 p-3 text-center"><div className="text-lg font-bold tnum">{me.harvests.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Ernten</div></div>
              <button type="button" disabled={isGuest} onClick={() => setList("followers")} className="rounded-xl bg-surface-2 p-3 text-center transition hover:bg-surface-3"><div className="text-lg font-bold tnum">{me.followers.toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Follower</div></button>
              <button type="button" disabled={isGuest} onClick={() => setList("following")} className="rounded-xl bg-surface-2 p-3 text-center transition hover:bg-surface-3"><div className="text-lg font-bold tnum">{(me.following ?? 0).toLocaleString("de-DE")}</div><div className="text-xs text-fg-subtle">Folgt</div></button>
            </div>
          </div>
        </Card>
      </Reveal>

      <Segmented value={tab} onChange={setTab} options={[{ value: "profil", label: "Profil" }, { value: "settings", label: "Einstellungen" }]} />

      {tab === "profil" && (
        <>
          {!isGuest && <Reveal delay={0.03}><FollowRequestsCard onChanged={() => void refreshUser()} /></Reveal>}
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
          {!isGuest && (
            <Reveal className="lg:col-span-2">
              <PrivacyCard />
            </Reveal>
          )}
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
              <ToggleRow
                label="Erinnerung an Messwerte und Logs"
                desc={config.useMock ? "Im Demo-Modus nicht verfügbar (braucht einen Server)." : "Eine Meldung, wenn bei einem laufenden Grow zu lange kein Messwert oder Log-Eintrag steht."}
                checked={me.growReminderDays != null}
                disabled={isGuest || config.useMock || reminderSaving}
                onChange={(v) => void setReminder(v ? 2 : null)}
              />
              {me.growReminderDays != null && (
                <Field label="Erinnern nach" hint="Tage ohne Eintrag; je Lücke nur einmal.">
                  <Select value={String(me.growReminderDays)} disabled={reminderSaving} onChange={(e) => void setReminder(Number(e.target.value))} aria-label="Erinnerung nach Tagen ohne Eintrag" data-testid="reminder-days">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? "1 Tag" : `${n} Tagen`}</option>)}
                  </Select>
                </Field>
              )}
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
            {isGuest ? (
              <CollapsibleCard icon="AlertTriangle" tone="danger" title="Gefahrenzone" className="border-danger/30 p-5" bodyClassName="space-y-2">
                <p className="text-sm text-fg-muted">Als Gast gibt es kein Konto, das gelöscht werden könnte.</p>
              </CollapsibleCard>
            ) : (
              <AccountData onDeleted={() => navigate("auth")} />
            )}
          </Reveal>
        </div>
      )}
    </div>
  );
}

const VISIBILITY_OPTIONS: { value: ProfileVisibility; label: string; desc: string }[] = [
  { value: "all", label: "Alle", desc: "Jedes angemeldete Mitglied sieht dein Profil und kann dir direkt folgen." },
  { value: "followers", label: "Nur Follower", desc: "Folgen braucht deine Bestätigung. Andere sehen nur Name, Bild und Titel." },
  { value: "nobody", label: "Niemand", desc: "Dein Profil ist privat. Neue Follower sind nicht möglich, bestehende bleiben." },
];

/** Wer das Profil sehen und ihm folgen darf (B-73). Speichert sofort. */
function PrivacyCard() {
  const me = useCurrentUser();
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const value = me.profileVisibility ?? "all";
  const change = async (next: ProfileVisibility) => {
    if (next === value) return;
    setBusy(true);
    try {
      await updateProfile({ profileVisibility: next });
      toast.push({ title: "Sichtbarkeit gespeichert", tone: "leaf", icon: "CheckCircle2" });
    } catch (error) {
      toast.push({ title: "Nicht gespeichert", desc: error instanceof Error ? error.message : "Bitte noch einmal versuchen.", tone: "danger", icon: "AlertTriangle" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <CollapsibleCard icon="Lock" title="Privatsphäre" className="p-5" bodyClassName="space-y-3">
      <div className="text-sm font-medium">Dein Profil ist sichtbar für</div>
      <div className={cn(busy && "pointer-events-none opacity-60")}><Segmented value={value} onChange={(v) => void change(v)} options={VISIBILITY_OPTIONS.map(({ value: v, label }) => ({ value: v, label }))} /></div>
      <p className="text-xs text-fg-subtle">{VISIBILITY_OPTIONS.find((o) => o.value === value)?.desc} „Alle“ meint angemeldete Mitglieder, keine Besucher ohne Konto. Name, Bild und Titel sind immer sichtbar.</p>
      {value === "all" && <p className="text-xs text-fg-subtle">Wechselst du auf „Alle“, werden offene Anfragen angenommen; bei „Niemand“ werden sie gelöscht.</p>}
    </CollapsibleCard>
  );
}

/** Ort, Anbau-Beginn, Medium und Interessen als kompakte Zeile bzw. Badges. */
function ProfileFacts({ me }: { me: ReturnType<typeof useCurrentUser> }) {
  const facts = [
    me.location ? { icon: "MapPin", text: me.location } : null,
    me.growSince ? { icon: "CalendarDays", text: `Baut an seit ${me.growSince}` } : null,
    me.medium ? { icon: "Sprout", text: me.medium } : null,
  ].filter((f): f is { icon: string; text: string } => !!f);
  const interests = me.interests ?? [];
  if (facts.length === 0 && interests.length === 0) return null;
  return (
    <>
      {facts.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">{facts.map((f) => <li key={f.text} className="flex items-center gap-1.5"><Icon name={f.icon} size={14} />{f.text}</li>)}</ul>}
      {interests.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{interests.map((i) => <Badge key={i} tone="leaf">{i}</Badge>)}</div>}
    </>
  );
}

function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useCurrentUser();
  const { updateProfile } = useAuth();
  const toast = useToast();
  const currentHandle = me.handle.replace(/^@/, "");
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [avatar, setAvatar] = useState(me.avatar);
  const [cover, setCover] = useState(me.cover ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [location, setLocation] = useState(me.location ?? "");
  const [growSince, setGrowSince] = useState(me.growSince ? String(me.growSince) : "");
  const [medium, setMedium] = useState<string | null>(me.medium ?? null);
  const [interests, setInterests] = useState<string[]>(me.interests ?? []);
  const [handle, setHandle] = useState(currentHandle);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const nextHandleChange = me.handleChangedAt ? new Date(new Date(me.handleChangedAt).getTime() + HANDLE_COOLDOWN_DAYS * 86_400_000) : null;
  const handleLocked = !!nextHandleChange && nextHandleChange.getTime() > Date.now();
  const handleChanged = handle.trim().toLowerCase() !== currentHandle.toLowerCase();
  const nameError = name.trim().length < 2 ? "Mindestens 2 Zeichen." : "";
  const yearNumber = growSince.trim() === "" ? null : Number(growSince);
  const yearError = yearNumber !== null && (!Number.isInteger(yearNumber) || yearNumber < GROW_SINCE_MIN || yearNumber > year) ? `Jahr zwischen ${GROW_SINCE_MIN} und ${year}.` : "";
  const handleError = handleChanged && !HANDLE_PATTERN.test(handle.trim()) ? "3–32 Zeichen: Buchstaben, Zahlen und _." : "";
  const invalid = !!nameError || !!yearError || !!handleError;
  const toggleInterest = (value: string) => setInterests((current) => (current.includes(value) ? current.filter((i) => i !== value) : current.length >= INTERESTS_MAX ? current : [...current, value]));
  const save = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      await updateProfile({
        name: name.trim(), title: title.trim() || "Grower", avatar, cover,
        bio: bio.trim(), location: location.trim(), growSince: yearNumber, medium, interests,
        ...(handleChanged ? { handle: handle.trim() } : {}),
      });
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
      footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={save} loading={busy} disabled={invalid}>Speichern</Button></>}>
      <div className="space-y-4">
        <div>
          <div className="relative overflow-hidden rounded-xl"><ProfileBanner src={cover} className="h-24" /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ImagePickButton onUploaded={setCover} label="Titelbild ändern" className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-surface-2">
              <Icon name="Image" size={16} /> Titelbild wählen
            </ImagePickButton>
            {cover && <Button size="sm" variant="ghost" onClick={() => setCover("")}>Entfernen</Button>}
          </div>
        </div>
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
        <Field label="Benutzername" hint={handleLocked ? `Wieder änderbar ab ${nextHandleChange!.toLocaleDateString("de-DE")}.` : `Änderbar höchstens alle ${HANDLE_COOLDOWN_DAYS} Tage. Dein Profil liegt unter /u/${handle.trim().toLowerCase() || "…"}.`}>
          <Input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))} maxLength={32} disabled={handleLocked} autoCapitalize="none" autoCorrect="off" aria-invalid={!!handleError} />
        </Field>
        {handleError && <p role="alert" className="text-xs font-medium text-danger">{handleError}</p>}
        <Field label="Titel" hint="z. B. Living-Soil-Fan"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} /></Field>
        <Field label="Über mich" hint={`${bio.length}/${BIO_MAX}`}><Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX} placeholder="Was baust du an, was treibt dich an?" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ort" hint="z. B. Region, kein genauer Wohnort"><Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={LOCATION_MAX} /></Field>
          <Field label="Anbau seit (Jahr)"><Input inputMode="numeric" value={growSince} onChange={(e) => setGrowSince(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={String(year)} aria-invalid={!!yearError} /></Field>
        </div>
        {yearError && <p role="alert" className="text-xs font-medium text-danger">{yearError}</p>}
        <div>
          <div className="mb-1.5 text-sm font-medium">Medium</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Medium">
            {MEDIA.map((m) => <Chip key={m} active={medium === m} aria-pressed={medium === m} onClick={() => setMedium(medium === m ? null : m)}>{m}</Chip>)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm font-medium"><span>Interessen</span><span className="text-xs font-normal text-fg-subtle">{interests.length}/{INTERESTS_MAX}</span></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Interessen">
            {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} aria-pressed={interests.includes(i)} disabled={!interests.includes(i) && interests.length >= INTERESTS_MAX} onClick={() => toggleInterest(i)}>{i}</Chip>)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><div className="text-sm font-medium">{label}</div><div className="text-xs text-fg-subtle">{desc}</div></div>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}
