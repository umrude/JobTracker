// How far back the first Gmail sync looks. Later syncs use Gmail's
// history instead, so this only matters once. Pure: tested on its own.
// See docs/gmail-sync.md, "Decisions".

const DAY = 24 * 60 * 60 * 1000;

// Default: a week before your earliest application (the confirmation can
// arrive a little before the date you recorded), capped at about 6 months.
export const DEFAULT_LOOKBACK_CAP_DAYS = 183;
// A start date you pick can go back further, but not without limit: the
// first sync reads every message in the window.
export const MAX_LOOKBACK_DAYS = 366;
// With no applications yet, a month back.
const EMPTY_LOOKBACK_DAYS = 30;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function defaultSyncStart(earliestAppliedAt: Date | null, now: Date): Date {
  const cap = now.getTime() - DEFAULT_LOOKBACK_CAP_DAYS * DAY;
  const wanted = earliestAppliedAt ? earliestAppliedAt.getTime() - 7 * DAY : now.getTime() - EMPTY_LOOKBACK_DAYS * DAY;
  return startOfUtcDay(new Date(Math.max(wanted, cap)));
}

export type SyncStartCheck = { ok: true; start: Date } | { ok: false; message: string };

export function checkSyncStart(chosen: Date, now: Date): SyncStartCheck {
  if (Number.isNaN(chosen.getTime())) return { ok: false, message: "Pick a valid date." };
  if (chosen.getTime() > now.getTime()) return { ok: false, message: "The start date can't be in the future." };
  if (chosen.getTime() < now.getTime() - MAX_LOOKBACK_DAYS * DAY) {
    return { ok: false, message: "The first sync can look back at most a year." };
  }
  return { ok: true, start: startOfUtcDay(chosen) };
}
