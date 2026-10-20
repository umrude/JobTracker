import { canTransition, type Status } from "@/lib/schemas/status";
import type { EmailType } from "@/lib/schemas/email";

// Turns the classifier's answer into a suggested status change, given
// where the application is now. This is code, not the model's judgment:
// the same email means different things for different applications. Null
// means "no change": the email is still shown, as news, but suggests
// nothing to confirm. Pure: tested on its own. See docs/gmail-sync.md.

// Which statuses each kind of news moves forward from. Never backwards: a
// late "we received your application" doesn't undo Interviewing.
const MOVES_FROM: Record<EmailType, { to: Status; from: readonly Status[] } | null> = {
  // Ghosted counts as waiting: any reply revives it.
  acknowledged: { to: "acknowledged", from: ["applied", "ghosted"] },
  interview: { to: "interviewing", from: ["applied", "acknowledged", "ghosted"] },
  assessment: { to: "interviewing", from: ["applied", "acknowledged", "ghosted"] },
  // From anywhere still open, including Offer (a rescinded offer).
  rejection: { to: "rejected", from: ["applied", "acknowledged", "interviewing", "offer", "ghosted"] },
  offer: { to: "offer", from: ["applied", "acknowledged", "interviewing", "ghosted"] },
  not_relevant: null,
};

export function proposeStatus(type: EmailType | null, current: Status | null): Status | null {
  if (type === null || current === null) return null;
  const move = MOVES_FROM[type];
  if (!move || !move.from.includes(current) || !canTransition(current, move.to)) return null;
  return move.to;
}

// A classifier confidence at or above this counts as "sure": a sure "not
// relevant" is filed away instead of waiting for review, and the eval
// reports accuracy above and below it.
export const CONFIDENT_AT = 0.8;
