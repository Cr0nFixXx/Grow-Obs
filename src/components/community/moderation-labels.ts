import type { ReportKind, ReportReason } from "@/types";

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "Spam oder Werbung", hint: "Unerwünschte Werbung, Verkaufsversuche, Wiederholungen" },
  { value: "harassment", label: "Beleidigung oder Belästigung", hint: "Persönliche Angriffe, Hetze, Drohungen" },
  { value: "illegal", label: "Rechtswidrige Inhalte", hint: "Illegale Angebote oder Inhalte" },
  { value: "offtopic", label: "Passt nicht hierher", hint: "Nicht zum Thema der Community" },
  { value: "other", label: "Sonstiges", hint: "Etwas anderes – bitte kurz beschreiben" },
];

export const reasonLabel = (reason: ReportReason): string => REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;

const KIND_LABEL: Record<ReportKind, string> = { post: "Beitrag", comment: "Kommentar", thread: "Thread", forum_comment: "Kommentar" };
export const kindLabel = (kind: ReportKind): string => KIND_LABEL[kind] ?? "Inhalt";
