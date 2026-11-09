import type { Services } from "@/services/interfaces";
import type { ReportAction, ReportInput, ReportKind, ReportPage } from "@/types";

/**
 * Moderationsbereich (B-89): eine Community (`communityId`) oder die Plattform (`null` = globaler Feed und Forum).
 * Kapselt, welcher Service Melden, Aus-/Einblenden und die Warteschlange bedient.
 */
export function moderationFor(svc: Services, communityId: string | null) {
  return {
    report: (input: ReportInput): Promise<{ duplicate: boolean }> =>
      communityId ? svc.communities.report(communityId, input) : svc.moderation.report(input),
    setHidden: (kind: ReportKind, targetId: string, hidden: boolean): Promise<void> =>
      communityId ? svc.communities.setHidden(communityId, kind, targetId, hidden) : svc.moderation.setHidden(kind, targetId, hidden),
    queue: (status: "open" | "closed", offset: number): Promise<ReportPage> =>
      communityId ? svc.communities.reports(communityId, status, offset) : svc.moderation.queue(status, offset),
    resolve: (kind: ReportKind, targetId: string, action: ReportAction): Promise<void> =>
      communityId ? svc.communities.resolveReport(communityId, kind, targetId, action) : svc.moderation.resolve(kind, targetId, action),
  };
}

/** Plattform-Moderation (Rolle Moderator, Admin oder Betreiber). */
export const isPlatformModerator = (role: string | undefined | null): boolean => role === "moderator" || role === "admin" || role === "platform_admin";
