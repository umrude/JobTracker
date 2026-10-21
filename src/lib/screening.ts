import type { Status } from "@/lib/schemas/status";

// "Passed screening": the application got past screening to a person, as
// far as you know. It's a fact you record ("Under Consideration" in the
// portal), or one implied by an interview or offer. It's never "failed":
// you rarely learn that, so empty means unknown. Pure: tested on its own.
// See docs/insights.md.

const IMPLIES_PASSED: readonly Status[] = ["interviewing", "offer"];

export function statusImpliesScreening(status: Status): boolean {
  return IMPLIES_PASSED.includes(status);
}

// The passed-screening date after a change: kept once set, set when the
// status implies it, set or cleared when you tick or untick it. Unticking
// can't undo what the status implies: an interview means you passed.
export function nextPassedScreeningAt(
  current: Date | null,
  status: Status,
  now: Date,
  // What you chose in the form; undefined when the change didn't ask (a
  // drag on the board, a confirmed email).
  chosen?: boolean,
): Date | null {
  if (statusImpliesScreening(status)) return current ?? now;
  if (chosen === undefined) return current;
  return chosen ? (current ?? now) : null;
}
