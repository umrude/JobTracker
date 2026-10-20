import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import {
  confirmSuggestion,
  dismissSuggestion,
  linkSuggestion,
  pendingSuggestionCount,
  pendingSuggestionRows,
  recentlyDecidedRows,
  type DecideResult,
} from "@/server/db/email-event-store";

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

export async function listRecentlyDecided() {
  const { db, userId } = await scope();
  return recentlyDecidedRows(db, userId);
}

export async function countPendingSuggestions(): Promise<number> {
  const { db, userId } = await scope();
  return pendingSuggestionCount(db, userId);
}

export async function confirm(id: number): Promise<DecideResult> {
  const { db, userId } = await scope();
  return confirmSuggestion(db, userId, id);
}

export async function dismiss(id: number): Promise<DecideResult> {
  const { db, userId } = await scope();
  return dismissSuggestion(db, userId, id);
}

export async function link(id: number, applicationId: number): Promise<DecideResult> {
  const { db, userId } = await scope();
  return linkSuggestion(db, userId, id, applicationId);
}
