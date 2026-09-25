import type { FeatureKey } from "@/config/features";
import type { Tone } from "@/lib/tokens";

/**
 * Schnellaktionen → Unterseiten der View `create` (src/views/Create.tsx).
 * Genutzt von FAB (AppShell), Dashboard, Grows, Sorten und Wiki.
 */
export type CreateKind = "grow" | "log" | "strain" | "task" | "wiki";

interface KindMeta {
  title: string;
  subtitle: string;
  icon: string;
  tone: Tone;
  feature: FeatureKey;
}

export const createKinds: Record<CreateKind, KindMeta> = {
  grow: { title: "Neuer Grow", subtitle: "Lege einen neuen Durchgang an – Sorte, Medium und Ziel.", icon: "Sprout", tone: "leaf", feature: "grows" },
  log: { title: "Log-Eintrag", subtitle: "Dokumentiere Gießen, Düngen, Training oder Beobachtungen.", icon: "NotebookPen", tone: "soil", feature: "grows" },
  strain: { title: "Sorte hinzufügen", subtitle: "Neue Genetik in deine persönliche Sammlung aufnehmen.", icon: "Leaf", tone: "info", feature: "strains" },
  task: { title: "Task anlegen", subtitle: "Erinnerung für den nächsten Pflegeschritt.", icon: "ListChecks", tone: "warning", feature: "dashboard" },
  wiki: { title: "Wiki-Artikel erstellen", subtitle: "Teile dein Wissen – der Artikel startet als Community-Entwurf (v0.1).", icon: "BookOpen", tone: "info", feature: "wiki" },
};

