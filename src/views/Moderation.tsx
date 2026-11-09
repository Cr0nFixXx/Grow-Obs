import { useMemo } from "react";
import { PageHeader } from "@/components/ui";
import { ReportQueue } from "@/components/community/ReportQueue";
import { useServices } from "@/data/DataContext";
import { moderationFor } from "@/lib/moderation-scope";

/**
 * Plattform-Moderation (B-89): Meldungen zu globalem Feed und Forum für die Rollen Moderator, Admin und Betreiber.
 * Community-Meldungen bearbeiten die Moderatoren der jeweiligen Community in ihrer Community.
 */
export default function Moderation() {
  const svc = useServices();
  const scoped = useMemo(() => moderationFor(svc, null), [svc]);
  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="platform-moderation">
      <PageHeader title="Moderation" subtitle="Gemeldete Beiträge, Threads und Kommentare aus Feed und Forum." icon="ShieldCheck" />
      <ReportQueue scope="platform" load={scoped.queue} act={scoped.resolve} />
    </div>
  );
}
