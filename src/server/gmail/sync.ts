// No "server-only" here: the demo seed runs this with its own connection,
// and tests run it against an in-memory database. It gets everything it
// talks to (the database, the mail source, the classifier) as arguments,
// so the same code runs live, in demo mode, in the seed, and in tests.
// The live wiring is in src/server/gmail-sync.ts.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/server/db/schema";
import type { Classification, EmailMeta } from "@/lib/schemas/email";
import { prefilter } from "@/lib/email/prefilter";
import { matchByClassifier, matchEmail, type Match, type MatchTarget } from "@/lib/email/matching";
import { proposeForSavedJob, proposeStatus, CONFIDENT_AT } from "@/lib/email/propose";
import { ghostedCandidates, GHOSTED_AFTER_DAYS } from "@/lib/email/ghosted";
import {
  applicationsForSync,
  ghostedInputs,
  insertEmailEvent,
  linkedThreads,
  processedMessageIds,
  savedJobsForSync,
  unclassifiedEmailRows,
  updateEmailEvent,
  type SyncApplication,
  type SyncSavedJob,
} from "@/server/db/email-event-store";
import type { MailSource } from "@/server/gmail/mail-source";
import { plural } from "@/lib/format";

type AppDb = BetterSQLite3Database<typeof schema>;

export type ClassifyOutcome =
  | { ok: true; classification: Classification; model: string }
  // stopSync: the classifier can't work at all right now (out of credits,
  // no or rejected API key, API unreachable), as opposed to one email it
  // couldn't answer. The sync stops instead of storing every email as
  // "Couldn't classify", which would never be retried.
  | { ok: false; message: string; stopSync?: { reason: "out_of_credits" | "unavailable" } };

// Thrown when the classifier can't work at all. Nothing from the batch
// that hit it is stored and the sync position isn't saved, so syncing
// again (after adding credits, say) picks up exactly where it stopped:
// emails stored before it are skipped, the rest are classified then.
export class ClassifierUnavailable extends Error {
  constructor(
    readonly reason: "out_of_credits" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ClassifierUnavailable";
  }
}

// Classifies one candidate, given what matching linked it to (if
// anything). Live: fetch the body, ask the model. Demo: look up the canned
// answer.
export type Classifier = (email: EmailMeta, about: MatchTarget | null) => Promise<ClassifyOutcome>;

// What an email can be about: an application, or a saved job you applied
// to but haven't moved to Applied.
type Target = ({ kind: "application" } & SyncApplication) | ({ kind: "job" } & SyncSavedJob);

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

function* batches<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

// Classifies a batch at once. An account-level failure (out of credits, no
// key) stops the whole run before anything in the batch is stored, so a
// later run picks up from here (see ClassifierUnavailable).
async function classifyBatch(
  batch: readonly { email: EmailMeta; match: Match<Target> }[],
  classify: Classifier,
): Promise<ClassifyOutcome[]> {
  const outcomes = await Promise.all(batch.map(({ email, match }) => classify(email, match.target)));
  for (const outcome of outcomes) {
    if (!outcome.ok && outcome.stopSync) throw new ClassifierUnavailable(outcome.stopSync.reason, outcome.message);
  }
  return outcomes;
}
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

  // 3. Pre-filter and match, in order. Applications and saved jobs are
  // matched together, so one application and one saved job at the same
  // company are told apart by title rather than mixed up. A reply in a
  // thread that's already linked is a candidate even if the pre-filter
  // wouldn't keep it: "Re: Scheduling ... Monday works" names no company
  // and no hiring phrase.
  const { targets, threadTargets } = loadTargets(db, userId);
  const companies = [...new Set(targets.map((t) => t.company))];
  const planned: { email: EmailMeta; match: Match<Target> }[] = [];
  for (const email of fresh) {
    if (!prefilter(email, companies).candidate && !threadTargets.has(email.threadId)) continue;
    const match = matchEmail(email, targets, threadTargets.get(email.threadId));
    if (match.target) threadTargets.set(email.threadId, match.target);
    planned.push({ email, match });
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
  for (const chunk of batches(planned, CLASSIFY_CONCURRENCY)) {
    const outcomes = await classifyBatch(chunk, classify);
    chunk.forEach(({ email, match: headerMatch }, index) => {
      const outcome = outcomes[index];
      const fields = classifiedFields(outcome, headerMatch, targets, now);
      const target = fields.target;
      if (target) threadTargets.set(email.threadId, target);
      if (fields.hide) summary.hidden++;
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
        ...fields.values,
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

// What emails can be about, and the threads already linked to one.
function loadTargets(db: AppDb, userId: number) {
  const targets: Target[] = [
    ...applicationsForSync(db, userId).map((app) => ({ kind: "application" as const, ...app })),
    ...savedJobsForSync(db, userId).map((job) => ({ kind: "job" as const, ...job })),
  ];
  const threadTargets = new Map<string, Target>();
  for (const [thread, applicationId] of linkedThreads(db, userId)) {
    const target = targets.find((t) => t.kind === "application" && t.id === applicationId);
    if (target) threadTargets.set(thread, target);
  }
  return { targets, threadTargets };
}

// What gets stored for a classified (or unclassifiable) email: the link,
// the answer, the proposal, and whether it's filed away. Shared by sync and
// "Classify again", so the two can't drift apart.
function classifiedFields(outcome: ClassifyOutcome, headerMatch: Match<Target>, targets: readonly Target[], now: Date) {
  const classification = outcome.ok ? outcome.classification : null;
  // Not settled from the headers: try the company and role the classifier
  // read in the body.
  const match =
    headerMatch.target === null && classification ? matchByClassifier(classification, targets, headerMatch.candidates) : headerMatch;
  const target = match.target;
  // A sure "not relevant" is kept (so it isn't processed again) but filed
  // as dismissed. An unsure one waits for you like the rest.
  const hide = classification?.type === "not_relevant" && classification.confidence >= CONFIDENT_AT;
  const type = classification?.type ?? null;
  return {
    target,
    hide,
    values: {
      applicationId: target?.kind === "application" ? target.id : null,
      jobId: target?.kind === "job" ? target.id : null,
      matchMethod: match.target ? match.method : null,
      emailType: type,
      confidence: classification?.confidence ?? null,
      extractedCompany: classification?.company ?? null,
      extractedRole: classification?.role ?? null,
      reason: outcome.ok ? outcome.classification.reason : `Couldn't classify: ${outcome.message}`,
      proposedStatus:
        target?.kind === "application" ? proposeStatus(type, target.status) : target?.kind === "job" ? proposeForSavedJob(type) : null,
      model: outcome.ok ? outcome.model : null,
      state: hide ? ("dismissed" as const) : ("pending" as const),
      // The same instant for both: that's how review tells "filed away
      // automatically" from "you dismissed it".
      createdAt: now,
      decidedAt: hide ? now : null,
    },
  };
}

export type ReclassifySummary = { retried: number; classified: number; hidden: number; stillUnclassified: number };

// "Classify again": retries the stored emails the classifier couldn't
// answer (say, while the account was out of credits), without re-reading
// the inbox. Their bodies are fetched again (they were never stored), and
// ones that weren't linked are matched again with what the classifier
// reads. Rows already linked keep their link. Like sync, an account-level
// failure (ClassifierUnavailable) stops it: rows done so far stay done,
// and running it again finishes the rest.
export async function reclassifyStored(deps: {
  db: AppDb;
  userId: number;
  classify: Classifier;
  now: Date;
}): Promise<ReclassifySummary> {
  const { db, userId, classify, now } = deps;
  const rows = unclassifiedEmailRows(db, userId);
  const { targets, threadTargets } = loadTargets(db, userId);
  const summary: ReclassifySummary = { retried: rows.length, classified: 0, hidden: 0, stillUnclassified: 0 };

  const planned = rows.map((row) => {
    const email: EmailMeta = {
      id: row.gmailMessageId ?? "",
      threadId: row.gmailThreadId ?? "",
      fromAddress: row.fromAddress ?? "",
      fromName: row.fromName ?? "",
      subject: row.subject ?? "",
      snippet: row.snippet ?? "",
      receivedAt: row.receivedAt ?? row.createdAt,
      labels: [],
    };
    // Already linked (by sync or by you): keep that link. Otherwise match
    // again, now that matching knows saved jobs and near-identical roles.
    const linked =
      row.applicationId !== null
        ? targets.find((t) => t.kind === "application" && t.id === row.applicationId)
        : targets.find((t) => t.kind === "job" && t.id === row.jobId);
    if (linked && row.matchMethod) {
      // The method here is a placeholder: the stored one is kept below.
      return { row, email, match: { target: linked, method: "company" } satisfies Match<Target>, keepMethod: row.matchMethod };
    }
    return { row, email, match: matchEmail(email, targets, threadTargets.get(email.threadId)), keepMethod: null };
  });

  for (const chunk of batches(planned, CLASSIFY_CONCURRENCY)) {
    const outcomes = await classifyBatch(chunk, classify);
    chunk.forEach(({ row, email, match, keepMethod }, index) => {
      const outcome = outcomes[index];
      const fields = classifiedFields(outcome, match, targets, now);
      if (fields.target) threadTargets.set(email.threadId, fields.target);
      if (!outcome.ok) summary.stillUnclassified++;
      else if (fields.hide) summary.hidden++;
      else summary.classified++;
      // A link you made by hand stays marked as yours.
      updateEmailEvent(db, userId, row.id, { ...fields.values, matchMethod: keepMethod ?? fields.values.matchMethod });
    });
  }
  return summary;
}


// One sentence for the "Classify again" button.
export function describeReclassify(summary: ReclassifySummary): string {
  if (summary.retried === 0) return "Nothing to classify again.";
  const parts = [`Classified ${summary.classified} of ${plural(summary.retried, "email")}.`];
  if (summary.hidden > 0) parts.push(`${summary.hidden} not relevant, filed away.`);
  if (summary.stillUnclassified > 0) parts.push(`${summary.stillUnclassified} still couldn't be classified.`);
  return parts.join(" ");
}

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
