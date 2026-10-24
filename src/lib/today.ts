import type { Status } from "@/lib/schemas/status";
import { GHOSTED_AFTER_DAYS } from "@/lib/email/ghosted";

// The rules behind Today's "follow up?" nudges (docs/today.md). Pure: the
// data layer gathers the dates, this decides.

export const FOLLOW_UP_AFTER_DAYS = 10;

// Still waiting to hear back: the statuses a follow-up makes sense for.
const WAITING: readonly Status[] = ["applied", "acknowledged"];

const DAY = 24 * 60 * 60 * 1000;

export type FollowUpCandidate = {
  applicationId: number;
  company: string;
  title: string;
  status: Status;
  // Anything that counts as hearing back or acting on it: applying, a
  // status change, an email about it, or your last follow-up. Null dates
  // are ignored.
  appliedAt: Date | null;
  createdAt: Date;
  lastStatusChangeAt: Date | null;
  lastEmailAt: Date | null;
  followedUpAt: Date | null;
  // A ghosted-rule suggestion is waiting in the Inbox: that's the next
  // step, so Today doesn't nudge as well.
  ghostedSuggested: boolean;
};

export type FollowUp = {
  applicationId: number;
  company: string;
  title: string;
  status: Status;
  quietDays: number;
  followedUpAt: Date | null;
  // Long enough that the ghosted rule would apply (with Gmail connected,
  // the Inbox suggests it); Today says so.
  pastGhosted: boolean;
};

// The applications to nudge, quietest first.
export function followUpsDue(candidates: FollowUpCandidate[], now: Date): FollowUp[] {
  const due: FollowUp[] = [];
  for (const candidate of candidates) {
    if (!WAITING.includes(candidate.status) || candidate.ghostedSuggested) continue;
    const dates = [candidate.appliedAt, candidate.lastStatusChangeAt, candidate.lastEmailAt, candidate.followedUpAt].filter(
      (date): date is Date => date !== null,
    );
    const last = dates.length > 0 ? Math.max(...dates.map((date) => date.getTime())) : candidate.createdAt.getTime();
    const quietDays = Math.floor((now.getTime() - last) / DAY);
    if (quietDays < FOLLOW_UP_AFTER_DAYS) continue;
    due.push({
      applicationId: candidate.applicationId,
      company: candidate.company,
      title: candidate.title,
      status: candidate.status,
      quietDays,
      followedUpAt: candidate.followedUpAt,
      pastGhosted: quietDays >= GHOSTED_AFTER_DAYS,
    });
  }
  return due.sort((a, b) => b.quietDays - a.quietDays || a.applicationId - b.applicationId);
}
