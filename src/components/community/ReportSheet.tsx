import { useState } from "react";
import { BottomSheet, Button, Field, Textarea } from "@/components/ui";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import { moderationFor } from "@/lib/moderation-scope";
import type { ReportKind, ReportReason } from "@/types";
import { REPORT_REASONS, kindLabel } from "./moderation-labels";

/**
 * Inhalt melden (B-61, B-89). `communityId` = Meldung an die Moderation der Community; `null` = an die Plattform-Moderation
 * (globaler Feed, Forum).
 */
export function ReportSheet({ communityId, target, onClose }: {
  communityId: string | null;
  target: { kind: ReportKind; id: string } | null;
  onClose: () => void;
}) {
  const svc = useServices();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setReason("spam"); setDetails(""); onClose(); };
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const result = await moderationFor(svc, communityId).report({ kind: target.kind, targetId: target.id, reason, details: details.trim() || undefined });
      toast.push(result.duplicate
        ? { title: "Bereits gemeldet", desc: "Die Moderation kennt diese Meldung schon.", tone: "info", icon: "Flag" }
        : { title: "Danke für die Meldung", desc: "Die Moderation schaut es sich an.", tone: "leaf", icon: "Flag" });
      close();
    } catch (e) {
      toast.push({ title: "Meldung fehlgeschlagen", desc: e instanceof Error ? e.message : "Bitte später erneut versuchen", tone: "danger", icon: "AlertTriangle" });
    } finally { setBusy(false); }
  };

  return (
    <BottomSheet open={!!target} onClose={close} title={`${target ? kindLabel(target.kind) : "Inhalt"} melden`}>
      <div className="space-y-4" data-testid="report-sheet">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Was stimmt nicht?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1 accent-[var(--color-accent,#16a34a)]" />
              <span><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-fg-subtle">{r.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label="Details (optional)"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500} placeholder="Kurz beschreiben, was dich stört" /></Field>
        <Button className="w-full" onClick={() => void submit()} loading={busy}>Meldung senden</Button>
      </div>
    </BottomSheet>
  );
}
