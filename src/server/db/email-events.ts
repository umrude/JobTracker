import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import {
  confirmSuggestion,
  dismissSuggestion,
  emailsForApplication,
  addApplicationFromSuggestion,
  linkSuggestion,
  pendingSuggestionCount,
  pendingSuggestionRows,
  recentlyDecidedRows,
  unclassifiedCount,
  type DecideResult,
  type LinkTarget,
} from "@/server/db/email-event-store";
import type { Status } from "@/lib/schemas/status";

// The app's entry points for reviewing suggestions: the current mode's
// database and the current user. Ids from forms only ever reach your own
// rows.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function listPendingSuggestions() {
  const { db, userId } = await scope();
  return pendingSuggestionRows(db, userId);
}

// The emails about one of your applications (its page). Empty for anyone
// else's.
export async function listEmailsForApplication(applicationId: number) {
  const { db, userId } = await scope();
  return emailsForApplication(db, userId, applicationId);
}

export async function listRecentlyDecided() {
  const { db, userId } = await scope();
  return recentlyDecidedRows(db, userId);
}

export async function countPendingSuggestions(): Promise<number> {
  const { db, userId } = await scope();
  return pendingSuggestionCount(db, userId);
}

// Emails stored as "Couldn't classify", for the "Classify again" button.
export async function countUnclassified(): Promise<number> {
  const { db, userId } = await scope();
  return unclassifiedCount(db, userId);
}

export async function confirm(id: number): Promise<DecideResult> {
  const { db, userId } = await scope();
  return confirmSuggestion(db, userId, id);
}

export async function dismiss(id: number): Promise<DecideResult> {
  const { db, userId } = await scope();
  return dismissSuggestion(db, userId, id);
}

export async function link(id: number, target: LinkTarget): Promise<DecideResult> {
  const { db, userId } = await scope();
  return linkSuggestion(db, userId, id, target);
}

export async function addAsApplication(
  id: number,
  input: { company: string; title: string; status: Status; appliedAt: Date; listingText?: string | null },
): Promise<DecideResult> {
  const { db, userId } = await scope();
  return addApplicationFromSuggestion(db, userId, id, input);
}
