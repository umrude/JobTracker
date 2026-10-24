import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { GHOSTED_AFTER_DAYS } from "@/lib/email/ghosted";
import { plural } from "@/lib/format";
import type { StatusChange, StatusChangeSource } from "@/lib/schemas/status-history";

// Pure rules for an application's status history: what a new application's
// history starts with, and how to reconstruct one for applications that
// existed before history was kept. No I/O; the data layer stores the
// result (status-history-store.ts). See docs/status-history.md.

// The first steps for a new application. Usually one: it was created at
// its status. But an application added at a later stage (from an
// acknowledgment email, say) with an earlier applied date also gets its
// "applied" step, on that date, so the timeline starts where it really did.
export function creationChanges(input: {
  status: Status;
  appliedAt: Date | null;
  at: Date;
  source: StatusChangeSource;
  emailEventId?: number | null;
}): StatusChange[] {
  const emailEventId = input.emailEventId ?? null;
  if (input.status !== "applied" && input.appliedAt && input.appliedAt < input.at) {
    return [
      { from: null, to: "applied", at: input.appliedAt, source: input.source, emailEventId: null },
      { from: "applied", to: input.status, at: input.at, source: input.source, emailEventId },
    ];
  }
  const at = input.status === "applied" && input.appliedAt ? input.appliedAt : input.at;
  return [{ from: null, to: input.status, at, source: input.source, emailEventId }];
}

export type ConfirmedSuggestion = {
  id: number;
  source: "email" | "ghosted";
  // The status confirming it set.
  status: Status;
  // The email's date, or when you confirmed it if there's no email (the
  // ghosted rule).
  at: Date;
};

// A best reconstruction for an application with no recorded history, from
// what the database does know:
// - it was applied to on its applied date (or when it was added);
// - every email suggestion you confirmed for it moved it, on the email's
//   date, to the status you confirmed;
// - if it's now somewhere else, the last move was by hand, at its last
//   update.
// Steps with a guessed date are marked "estimated". Confirmed emails keep
// their own source and link, since those dates are real.
export function reconstructHistory(application: {
  status: Status;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  confirmed: ConfirmedSuggestion[];
}): StatusChange[] {
  const confirmed = [...application.confirmed].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
  // Applied no later than the first email about it.
  let start = application.appliedAt ?? application.createdAt;
  if (confirmed.length > 0 && confirmed[0].at < start) start = confirmed[0].at;

  const changes: StatusChange[] = [{ from: null, to: "applied", at: start, source: "estimated", emailEventId: null }];
  let current: Status = "applied";
  for (const suggestion of confirmed) {
    if (suggestion.status === current) continue;
    changes.push({ from: current, to: suggestion.status, at: suggestion.at, source: suggestion.source, emailEventId: suggestion.id });
    current = suggestion.status;
  }
  if (current !== application.status) {
    const last = changes[changes.length - 1].at;
    const at = application.updatedAt > last ? application.updatedAt : last;
    changes.push({ from: current, to: application.status, at, source: "estimated", emailEventId: null });
  }
  return changes;
}

// ---- Wording for the timeline (the application page) ----

// The step itself: "Applied", "Added at Interviewing", "Moved to Offer".
export function stepTitle(from: Status | null, to: Status): string {
  if (from === null) return to === "applied" ? "Applied" : `Added at ${STATUS_LABELS[to]}`;
  return `Moved to ${STATUS_LABELS[to]}`;
}

// Where the step came from, in a line.
export function stepOrigin(step: { source: StatusChangeSource; emailSubject: string | null; emailFrom: string | null }): string {
  switch (step.source) {
    case "board":
      return "On the board";
    case "email":
      if (!step.emailSubject) return "From an email";
      return `From an email: “${step.emailSubject}”${step.emailFrom ? `, ${step.emailFrom}` : ""}`;
    case "ghosted":
      return `Ghosted rule: no reply in ${GHOSTED_AFTER_DAYS} days, confirmed by you`;
    case "estimated":
      return "Date estimated: from before history was kept";
  }
}

const DAY = 24 * 60 * 60 * 1000;

// "12 days later", counted from the step before. Nothing for the first
// step, the same day, or a step dated before the one it follows (an old
// email confirmed late; see listStatusHistory).
export function stepGap(previous: Date | undefined, at: Date): string | null {
  if (!previous) return null;
  const days = Math.floor((at.getTime() - previous.getTime()) / DAY);
  return days >= 1 ? `${plural(days, "day")} later` : null;
}

// The same, in a few words, for one-line lists (Today's "Last 7 days").
export function stepOriginShort(source: StatusChangeSource): string {
  switch (source) {
    case "board":
      return "on the board";
    case "email":
      return "from an email";
    case "ghosted":
      return "by the ghosted rule";
    case "estimated":
      return "date estimated";
  }
}
