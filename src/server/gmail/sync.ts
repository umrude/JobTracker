// No "server-only" here: the demo seed runs this with its own connection,
// and tests run it against an in-memory database. It gets everything it
// talks to (the database, the mail source, the classifier) as arguments,
// so the same code runs live, in demo mode, in the seed, and in tests.
// The live wiring is in src/server/gmail-sync.ts.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/server/db/schema";
import type { Classification, EmailMeta } from "@/lib/schemas/email";
import { prefilter } from "@/lib/email/prefilter";
import { matchApplication } from "@/lib/email/matching";
import { proposeStatus, CONFIDENT_AT } from "@/lib/email/propose";
import { ghostedCandidates, GHOSTED_AFTER_DAYS } from "@/lib/email/ghosted";
import {
  applicationsForSync,
  ghostedInputs,
  insertEmailEvent,
  linkedThreads,
  processedMessageIds,
  type SyncApplication,
} from "@/server/db/email-event-store";
import type { MailSource } from "@/server/gmail/mail-source";

type AppDb = BetterSQLite3Database<typeof schema>;

export type ClassifyOutcome = { ok: true; classification: Classification; model: string } | { ok: false; message: string };

// Classifies one candidate. Live: fetch the body, ask the model. Demo:
// look up the canned answer.
export type Classifier = (email: EmailMeta, application: SyncApplication | null) => Promise<ClassifyOutcome>;

export type SyncPosition = {
  // From the last sync; null before the first.
  historyId: string | null;
  // Where listSince starts: the chosen start date on the first sync, or a
  // little before the last sync when Gmail's history has run out.
  since: Date;
};

export type SyncSummary = {
  // Messages read that weren't processed before. Ones the pre-filter
  // drops aren't stored, so re-reading the same mail counts them again.
  read: number;
  // Of those, the ones that looked like hiring news.
  candidates: number;
  // Suggestions now waiting for review (email and ghosted).
  suggestions: number;
  ghosted: number;
  // Not-relevant answers the classifier was sure of: stored, out of the way.
  hidden: number;
  // Emails the classifier couldn't answer for (still listed, for you).
  unclassified: number;
  // The batch hit the per-sync limit; the oldest messages were left out.
  truncated: boolean;
  // Gmail's history had run out, so this sync re-listed by date instead.
  relisted: boolean;
};

const CLASSIFY_CONCURRENCY = 4;
const DAY = 24 * 60 * 60 * 1000;

export async function syncInbox(deps: {
  db: AppDb;
  userId: number;
  source: MailSource;
  classify: Classifier;
  position: SyncPosition;
  now: Date;
}): Promise<{ summary: SyncSummary; historyId: string }> {
  const { db, userId, source, classify, position, now } = deps;

  // 1. What's new: Gmail's history if we have a position, else by date.
  let batch = position.historyId ? await source.listNew(position.historyId) : null;
  const relisted = position.historyId !== null && batch === null;
  batch ??= await source.listSince(position.since);

  // 2. Skip what was already processed. Oldest first, so an earlier email
  // links its thread before a later reply in it is matched.
  const seen = processedMessageIds(db, userId, batch.messages.map((m) => m.id));
  const fresh = batch.messages.filter((m) => !seen.has(m.id)).sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  // 3. Pre-filter and match, in order. A reply in a thread that's already
  // linked is a candidate even if the pre-filter wouldn't keep it: "Re:
  // Scheduling ... Monday works" names no company and no hiring phrase.
  const apps = applicationsForSync(db, userId);
  const companies = [...new Set(apps.map((app) => app.company))];
  const threads = linkedThreads(db, userId);
  const byId = new Map(apps.map((app) => [app.id, app]));
  const planned: { email: EmailMeta; app: SyncApplication | null; method: ReturnType<typeof matchApplication> }[] = [];
  for (const email of fresh) {
    if (!prefilter(email, companies).candidate && !threads.has(email.threadId)) continue;
    const match = matchApplication(email, apps, threads);
    const app = match.applicationId === null ? null : (byId.get(match.applicationId) ?? null);
    if (app) threads.set(email.threadId, app.id);
    planned.push({ email, app, method: match });
  }

  // 4. Classify, a few at a time, and store each as it's answered.
  const summary: SyncSummary = {
    read: fresh.length,
    candidates: planned.length,
    suggestions: 0,
    ghosted: 0,
    hidden: 0,
    unclassified: 0,
    truncated: batch.truncated,
    relisted,
  };
  for (let i = 0; i < planned.length; i += CLASSIFY_CONCURRENCY) {
    const chunk = planned.slice(i, i + CLASSIFY_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map(({ email, app }) => classify(email, app)));
    chunk.forEach(({ email, app, method }, index) => {
      const outcome = outcomes[index];
      const classification = outcome.ok ? outcome.classification : null;
      // A sure "not relevant" is kept (so it isn't processed again) but
      // filed as dismissed. An unsure one waits for you like the rest.
      const hide = classification?.type === "not_relevant" && classification.confidence >= CONFIDENT_AT;
      if (hide) summary.hidden++;
      else summary.suggestions++;
      if (!outcome.ok) summary.unclassified++;

      insertEmailEvent(db, userId, {
        source: "email",
        gmailMessageId: email.id,
        gmailThreadId: email.threadId,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        subject: email.subject,
        snippet: email.snippet,
        receivedAt: email.receivedAt,
        applicationId: app?.id ?? null,
        matchMethod: "method" in method ? method.method : null,
        emailType: classification?.type ?? null,
        confidence: classification?.confidence ?? null,
        reason: outcome.ok ? outcome.classification.reason : `Couldn't classify: ${outcome.message}`,
        proposedStatus: proposeStatus(classification?.type ?? null, app?.status ?? null),
        model: outcome.ok ? outcome.model : null,
        state: hide ? "dismissed" : "pending",
        // The same instant for both: that's how review tells "filed away
        // automatically" from "you dismissed it".
        createdAt: now,
        decidedAt: hide ? now : null,
      });
    });
  }

  // 5. The ghosted rule, now that this sync's emails count as activity.
  const freshApps = applicationsForSync(db, userId);
  for (const id of ghostedCandidates(ghostedInputs(db, userId, freshApps), now)) {
    const app = freshApps.find((a) => a.id === id);
    const since = Math.max(app?.appliedAt?.getTime() ?? 0, app?.updatedAt.getTime() ?? 0);
    const days = Math.floor((now.getTime() - since) / DAY);
    insertEmailEvent(db, userId, {
      source: "ghosted",
      applicationId: id,
      reason: `No email about it and no change for ${days} days (the rule is ${GHOSTED_AFTER_DAYS}).`,
      proposedStatus: "ghosted",
      createdAt: now,
    });
    summary.ghosted++;
    summary.suggestions++;
  }

  return { summary, historyId: batch.historyId };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One sentence for the Sync button to show.
export function describeSync(summary: SyncSummary): string {
  const parts: string[] = [];
  if (summary.read === 0 && summary.suggestions === 0) {
    parts.push("No new email.");
  } else if (summary.suggestions === 0 && summary.hidden === 0) {
    parts.push(`Read ${plural(summary.read, "email")}: nothing new about your applications.`);
  } else {
    const ghosted = summary.ghosted > 0 ? ` (${summary.ghosted} ghosted)` : "";
    parts.push(
      `Read ${plural(summary.read, "email")}, ${summary.candidates} about hiring: ${plural(summary.suggestions, "new suggestion")}${ghosted} to review.`,
    );
  }
  if (summary.hidden > 0) parts.push(`${summary.hidden} not relevant, filed away.`);
  if (summary.unclassified > 0) parts.push(`${summary.unclassified} couldn't be classified; they're listed for you.`);
  if (summary.truncated) parts.push("There was more email than one sync reads; the oldest was skipped.");
  if (summary.relisted) parts.push("Gmail's history had expired, so this sync re-read recent email by date.");
  return parts.join(" ");
}
