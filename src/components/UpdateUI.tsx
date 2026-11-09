import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useNav, type ViewKey } from "@/lib/nav";
import { useAppUpdate } from "@/lib/update";
import { useFeatures } from "@/config/FeatureContext";
import { featureMeta, type FeatureKey } from "@/config/features";
import { APP_CODENAME, BACKEND_VERSION, BUILD_NUMBER, FRONTEND_VERSION, versionLabel } from "@/lib/app-version";
import { Icon } from "@/components/Icon";
import { Badge, BottomSheet, Button, Card, CollapsibleCard, Segmented, Toggle } from "@/components/ui";
import type { Release } from "@/lib/update-logic";
import { CHANGELOG_URL, MAX_AUTO_ENTRIES, type WhatsNewEntry } from "@/lib/whats-new";

const severityLabel: Record<Release["severity"], { label: string; tone: "info" | "warning" | "danger" }> = {
  optional: { label: "Optional", tone: "info" },
  recommended: { label: "Empfohlen", tone: "warning" },
  required: { label: "Pflicht", tone: "danger" },
};
const featureLabel = (key: string) => featureMeta.find((f) => f.key === key)?.label ?? key;

/** Eine Release-Karte (Notes + „Öffnen“-Buttons für hervorgehobene Features). */
export function ReleaseItem({ r, onOpenFeature }: { r: Release; onOpenFeature?: (key: FeatureKey) => void }) {
  const { isEnabled } = useFeatures();
  return (
    <article className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{r.title}</span>
        <Badge>v{r.version}</Badge>
        {r.severity !== "optional" && <Badge tone={severityLabel[r.severity].tone}>{severityLabel[r.severity].label}</Badge>}
        <time className="ml-auto text-xs text-fg-subtle" dateTime={r.publishedAt}>{new Date(r.publishedAt).toLocaleDateString("de-DE")}</time>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-fg-muted">
        {r.notes.map((n, i) => <li key={i} className="flex gap-2"><Icon name="CheckCircle2" size={14} className="mt-0.5 shrink-0 text-accent" /> {n}</li>)}
      </ul>
      {onOpenFeature && r.features.some((k) => isEnabled(k as FeatureKey)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.features.filter((k) => isEnabled(k as FeatureKey)).map((k) => (
            <Button key={k} size="sm" variant="soft" onClick={() => onOpenFeature(k as FeatureKey)}><Icon name="Sparkles" size={14} /> {featureLabel(k)} öffnen</Button>
          ))}
        </div>
      )}
    </article>
  );
}

/** Eine gebündelte Änderung je Aufgabe (3–5 Stichpunkte) aus `src/data/whats-new.json`. */
export function ChangeItem({ e }: { e: WhatsNewEntry }) {
  return (
    <article className="rounded-2xl border border-border p-4" data-testid="whats-new-entry">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{e.title}</span>
        <time className="ml-auto text-xs text-fg-subtle" dateTime={e.date}>{new Date(e.date).toLocaleDateString("de-DE")}</time>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-fg-muted">
        {e.notes.map((n, i) => <li key={i} className="flex gap-2"><Icon name="CheckCircle2" size={14} className="mt-0.5 shrink-0 text-accent" /> {n}</li>)}
      </ul>
    </article>
  );
}

/** Globale Update-Oberfläche: Banner, Pflicht-Update, „Was ist neu“. In App.tsx/Shell eingebunden. */
export function UpdateLayer() {
  const u = useAppUpdate();
  const { user } = useAuth();
  const { navigate } = useNav();
  const showBanner = u.available && !u.mandatory && u.prefs.mode === "prompt" && !u.snoozed;
  const notes = u.unseen.length ? u.unseen : u.unseenChanges.length ? [] : u.releases.slice(0, 3);
  // Automatisch: nur das Neue (höchstens drei Aufgaben); manuell geöffnet: die letzten fünf.
  const changes = u.unseenChanges.length ? u.unseenChanges.slice(0, MAX_AUTO_ENTRIES) : u.changes.slice(0, 5);
  const moreChanges = u.unseenChanges.length - MAX_AUTO_ENTRIES;

  return (
    <>
      {/* Banner (Modus „Nachfragen“) */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            role="status" aria-live="polite"
            className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[90] mx-auto max-w-md lg:bottom-4 lg:left-auto lg:right-4 lg:mx-0"
          >
            <Card className="glass flex items-center gap-3 p-3 elev-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon name="Download" size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Update verfügbar{u.serverVersion ? ` · v${u.serverVersion}` : ""}</div>
                <div className="truncate text-xs text-fg-muted">{u.latest ? u.latest.title : "Neue Version der App"}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={u.snooze}>Später</Button>
              <Button size="sm" onClick={u.apply}>Aktualisieren</Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pflicht-Update: blockierend, unabhängig von der Einstellung */}
      {u.mandatory && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="mandatory-update-title">
          <Card className="w-full max-w-md space-y-4 p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-danger/15 text-danger"><Icon name="ShieldCheck" size={22} /></span>
              <div><h2 id="mandatory-update-title" className="text-lg font-bold">Update erforderlich</h2><p className="text-sm text-fg-muted">Diese Version wird nicht mehr unterstützt.</p></div>
            </div>
            {u.releases.find((r) => r.severity === "required") && <ReleaseItem r={u.releases.find((r) => r.severity === "required")!} />}
            <Button className="w-full" onClick={u.apply}><Icon name="Download" size={16} /> Jetzt aktualisieren</Button>
          </Card>
        </div>
      )}

      {/* Was ist neu */}
      {user && (
        <BottomSheet open={u.whatsNewOpen && !u.mandatory} onClose={u.closeWhatsNew} title="Was ist neu">
          <div className="space-y-3" data-testid="whats-new-sheet">
            {notes.length === 0 && changes.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">Noch keine Neuigkeiten veröffentlicht.</p>}
            {changes.map((e) => <ChangeItem key={e.id} e={e} />)}
            {moreChanges > 0 && <p className="text-center text-xs text-fg-subtle">… und {moreChanges} weitere Änderung{moreChanges === 1 ? "" : "en"} im Changelog.</p>}
            {notes.map((r) => <ReleaseItem key={r.id} r={r} onOpenFeature={(k) => { u.closeWhatsNew(); navigate(k as ViewKey); }} />)}
            <p className="text-center text-sm"><a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline" data-testid="changelog-link">Alle Änderungen im Changelog ansehen</a></p>
            <p className="text-center text-xs text-fg-subtle">Installiert: {versionLabel()}</p>
            <Button className="w-full" onClick={u.closeWhatsNew}>Verstanden</Button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** Einstellungen → App-Updates. */
export function UpdateSettingsCard() {
  const u = useAppUpdate();
  const statusText =
    u.status === "checking" ? "Suche nach Updates …"
      : u.available ? `Neue Version verfügbar${u.serverVersion ? ` (v${u.serverVersion})` : ""}`
        : u.status === "error" ? "Prüfung fehlgeschlagen – offline?"
          : u.lastChecked ? `Aktuell · geprüft ${u.lastChecked.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Noch nicht geprüft";
  return (
    <CollapsibleCard icon="Download" title="Updates & Was ist neu" className="p-5" bodyClassName="space-y-4" defaultOpen={false}>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Bei neuer Version</span>
        <Segmented value={u.prefs.mode} onChange={(mode) => u.setPrefs({ mode })}
          options={[{ value: "auto", label: "Automatisch" }, { value: "prompt", label: "Nachfragen" }, { value: "manual", label: "Manuell" }]} />
        <p className="text-xs text-fg-subtle">{u.prefs.mode === "auto" ? "Aktualisiert still beim nächsten Öffnen bzw. wenn die App im Hintergrund ist." : u.prefs.mode === "prompt" ? "Zeigt einen Hinweis mit „Aktualisieren“ / „Später“." : "Nur Hinweis hier und im Menü – du entscheidest selbst."} Pflicht-Updates erscheinen immer.</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-sm font-medium">„Was ist neu“ anzeigen</div><div className="text-xs text-fg-subtle">Nach Updates und neuen Ankündigungen</div></div>
        <Toggle checked={u.prefs.showWhatsNew} onChange={(v) => u.setPrefs({ showWhatsNew: v })} label="Was ist neu anzeigen" />
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><span className="text-fg-muted">Frontend · {APP_CODENAME}</span><span className="font-medium tnum">v{FRONTEND_VERSION}</span></div>
        <div className="mt-1 flex items-center justify-between gap-2"><span className="text-fg-muted">Backend</span><span className="font-medium tnum">v{BACKEND_VERSION}</span></div>
        <div className="mt-1 flex items-center justify-between gap-2"><span className="text-fg-muted">Build</span><span className="font-medium tnum">{BUILD_NUMBER}</span></div>
        <div className="mt-1 flex items-center justify-between gap-2"><span className="text-fg-muted">Status</span><span className={u.available ? "font-medium text-accent" : ""}>{statusText}</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {u.available
          ? <Button onClick={u.apply}><Icon name="Download" size={16} /> Jetzt aktualisieren</Button>
          : <Button variant="secondary" loading={u.status === "checking"} onClick={() => void u.check()}>Nach Updates suchen</Button>}
        <Button variant="ghost" onClick={u.openWhatsNew} data-testid="open-whats-new">Was ist neu</Button>
      </div>
    </CollapsibleCard>
  );
}

/** Kompakter Hinweis für Menü/Drawer (v. a. Modus „Manuell“). */
export function UpdateMenuHint({ onDone }: { onDone?: () => void }) {
  const u = useAppUpdate();
  if (!u.available) return null;
  return (
    <button onClick={() => { onDone?.(); u.apply(); }} className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-left text-sm transition hover:bg-accent/15">
      <Icon name="Download" size={18} className="text-accent" />
      <span className="min-w-0 flex-1"><span className="block font-semibold text-accent">Update verfügbar</span><span className="block truncate text-xs text-fg-muted">{u.latest?.title ?? "Tippen zum Aktualisieren"}</span></span>
    </button>
  );
}
