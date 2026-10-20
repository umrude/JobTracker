import type { Status } from "@/lib/schemas/status";

// The ghosted rule: an application that's still waiting (applied,
// acknowledged, or interviewing) with no email activity for a while gets a
// "Ghosted?" suggestion. Rule-based, no model; you confirm it like any
// other suggestion. Pure: tested on its own. See docs/gmail-sync.md.

export const GHOSTED_AFTER_DAYS = 30;

const WAITING: ReadonlySet<Status> = new Set(["applied", "acknowledged", "interviewing"]);

export type GhostedInput = {
  id: number;
  status: Status;
  appliedAt: Date | null;
  // When you last changed the application (moved it, edited it). A card
  // you moved to Interviewing last week isn't ghosted, email or not.
  updatedAt: Date | null;
  // The newest email linked to it, if any.
  lastEmailAt: Date | null;
  // When you last dismissed a ghosted suggestion for it, if ever.
  ghostedDismissedAt: Date | null;
  // Whether a ghosted suggestion for it is already waiting for review.
  ghostedPending: boolean;
};

export function ghostedCandidates(applications: readonly GhostedInput[], now: Date, days = GHOSTED_AFTER_DAYS): number[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return applications
    .filter((app) => {
      if (!WAITING.has(app.status) || app.ghostedPending) return false;
      const last = Math.max(app.appliedAt?.getTime() ?? 0, app.updatedAt?.getTime() ?? 0, app.lastEmailAt?.getTime() ?? 0);
      if (last === 0 || last > cutoff) return false;
      // You said "not ghosted" after the last activity: wait for new silence.
      if (app.ghostedDismissedAt && app.ghostedDismissedAt.getTime() >= last) {
        return app.ghostedDismissedAt.getTime() <= cutoff;
      }
      return true;
    })
    .map((app) => app.id);
}
