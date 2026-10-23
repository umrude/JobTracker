// No "server-only" here, like the other *-store.ts modules: the seed and
// tests use it with their own connection. Every function takes the
// database and owner as arguments and filters by the owner; the app
// reaches it through email-events.ts and gmail-sync.ts.
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, emailEvents, jobs } from "@/server/db/schema";
import { proposeForSavedJob, proposeStatus } from "@/lib/email/propose";
import type { GhostedInput } from "@/lib/email/ghosted";
import type { Status } from "@/lib/schemas/status";
import { nextPassedScreeningAt } from "@/lib/screening";
import { recordCreation, recordStatusChange } from "@/server/db/status-history-store";
import type { EmailType } from "@/lib/schemas/email";

type AppDb = BetterSQLite3Database<typeof schema>;

// ---- What sync needs ----

// Which of these Gmail messages were already processed (each is processed
// once per user, whatever it turned out to be).
export function processedMessageIds(db: AppDb, userId: number, ids: readonly string[]): Set<string> {
  const seen = new Set<string>();
  // SQLite caps bound parameters per statement; stay well under it.
  for (let i = 0; i < ids.length; i += 500) {
    const rows = db
      .select({ id: emailEvents.gmailMessageId })
      .from(emailEvents)
      .where(and(eq(emailEvents.userId, userId), inArray(emailEvents.gmailMessageId, ids.slice(i, i + 500))))
      .all();
    for (const row of rows) if (row.id) seen.add(row.id);
  }
  return seen;
}

// Gmail thread -> the application it's linked to, from earlier emails.
// Oldest first, so a later link (say, one you fixed by hand) wins.
export function linkedThreads(db: AppDb, userId: number): Map<string, number> {
  const rows = db
    .select({ thread: emailEvents.gmailThreadId, applicationId: emailEvents.applicationId })
    .from(emailEvents)
    .where(and(eq(emailEvents.userId, userId), isNotNull(emailEvents.gmailThreadId), isNotNull(emailEvents.applicationId)))
    .orderBy(asc(emailEvents.receivedAt), asc(emailEvents.id))
    .all();
  const map = new Map<string, number>();
  for (const row of rows) if (row.thread && row.applicationId) map.set(row.thread, row.applicationId);
  return map;
}

export function applicationsForSync(db: AppDb, userId: number) {
  return db
    .select({
      id: applications.id,
      company: jobs.company,
      title: jobs.title,
      status: applications.status,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)))
    .where(eq(applications.userId, userId))
    .all();
}

export type SyncApplication = ReturnType<typeof applicationsForSync>[number];

// Saved jobs (no application yet), for matching emails about a job you
// applied to but haven't moved to Applied.
export function savedJobsForSync(db: AppDb, userId: number) {
  return db
    .select({ id: jobs.id, company: jobs.company, title: jobs.title })
    .from(jobs)
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.userId, userId)))
    .where(and(eq(jobs.userId, userId), isNull(applications.id)))
    .all();
}

export type SyncSavedJob = ReturnType<typeof savedJobsForSync>[number];

export type NewEmailEvent = Omit<typeof emailEvents.$inferInsert, "id" | "userId">;

// Ignores a message already processed (the unique index), so two syncs at
// once can't create duplicates.
export function insertEmailEvent(db: AppDb, userId: number, values: NewEmailEvent): void {
  db.insert(emailEvents).values({ ...values, userId }).onConflictDoNothing().run();
}

// Emails the classifier couldn't answer that are still waiting, oldest
// first, for "Classify again".
export function unclassifiedEmailRows(db: AppDb, userId: number) {
  return db
    .select()
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.userId, userId),
        eq(emailEvents.source, "email"),
        eq(emailEvents.state, "pending"),
        isNull(emailEvents.emailType),
        isNotNull(emailEvents.gmailMessageId),
      ),
    )
    .orderBy(asc(emailEvents.receivedAt), asc(emailEvents.id))
    .all();
}

export function unclassifiedCount(db: AppDb, userId: number): number {
  return unclassifiedEmailRows(db, userId).length;
}

export function updateEmailEvent(db: AppDb, userId: number, id: number, values: Partial<NewEmailEvent>): void {
  db.update(emailEvents)
    .set(values)
    .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
    .run();
}

// The ghosted rule's inputs, for every application.
export function ghostedInputs(db: AppDb, userId: number, apps: readonly SyncApplication[]): GhostedInput[] {
  const lastEmail = new Map(
    db
      .select({ applicationId: emailEvents.applicationId, at: max(emailEvents.receivedAt) })
      .from(emailEvents)
      .where(and(eq(emailEvents.userId, userId), eq(emailEvents.source, "email"), isNotNull(emailEvents.applicationId)))
      .groupBy(emailEvents.applicationId)
      .all()
      .map((row) => [row.applicationId, row.at] as const),
  );
  const ghosted = db
    .select({ applicationId: emailEvents.applicationId, state: emailEvents.state, decidedAt: emailEvents.decidedAt })
    .from(emailEvents)
    .where(and(eq(emailEvents.userId, userId), eq(emailEvents.source, "ghosted")))
    .all();

  return apps.map((app) => {
    const mine = ghosted.filter((row) => row.applicationId === app.id);
    const dismissed = mine
      .filter((row) => row.state === "dismissed" && row.decidedAt)
      .map((row) => row.decidedAt?.getTime() ?? 0);
    return {
      id: app.id,
      status: app.status,
      appliedAt: app.appliedAt,
      updatedAt: app.updatedAt,
      lastEmailAt: lastEmail.get(app.id) ?? null,
      ghostedDismissedAt: dismissed.length > 0 ? new Date(Math.max(...dismissed)) : null,
      ghostedPending: mine.some((row) => row.state === "pending"),
    };
  });
}

// ---- What review needs ----

function suggestionColumns() {
  return {
    id: emailEvents.id,
    source: emailEvents.source,
    gmailMessageId: emailEvents.gmailMessageId,
    fromAddress: emailEvents.fromAddress,
    fromName: emailEvents.fromName,
    subject: emailEvents.subject,
    snippet: emailEvents.snippet,
    receivedAt: emailEvents.receivedAt,
    applicationId: emailEvents.applicationId,
    jobId: emailEvents.jobId,
    matchMethod: emailEvents.matchMethod,
    emailType: emailEvents.emailType,
    confidence: emailEvents.confidence,
    extractedCompany: emailEvents.extractedCompany,
    extractedRole: emailEvents.extractedRole,
    reason: emailEvents.reason,
    proposedStatus: emailEvents.proposedStatus,
    state: emailEvents.state,
    createdAt: emailEvents.createdAt,
    decidedAt: emailEvents.decidedAt,
    company: jobs.company,
    title: jobs.title,
    currentStatus: applications.status,
  };
}

// Joined to the application and its job, or to the saved job when the
// email is about one, all filtered by owner too: a link can only ever show
// your own data.
function withApplication(db: AppDb, userId: number) {
  return db
    .select(suggestionColumns())
    .from(emailEvents)
    .leftJoin(applications, and(eq(applications.id, emailEvents.applicationId), eq(applications.userId, userId)))
    .leftJoin(jobs, and(eq(jobs.id, sql`coalesce(${applications.jobId}, ${emailEvents.jobId})`), eq(jobs.userId, userId)));
}

const WAITING: readonly Status[] = ["applied", "acknowledged", "interviewing"];

// What a suggestion proposes *now*. The proposal stored at sync time is a
// snapshot; since then you may have moved the card on the board, or
// confirmed another email about the same application. Showing and
// confirming both use this, so a card never offers "Rejected ->
// Acknowledged" just because the email once meant that.
export function liveProposal(
  event: { source: "email" | "ghosted"; emailType: EmailType | null; applicationId: number | null; jobId: number | null },
  current: Status | null,
): Status | null {
  if (event.source === "ghosted") return current !== null && WAITING.includes(current) ? "ghosted" : null;
  // About a saved job: add it to the board at the status the email implies.
  if (event.applicationId === null) return event.jobId === null ? null : proposeForSavedJob(event.emailType);
  if (current === null) return null;
  return proposeStatus(event.emailType, current);
}

// Changes first (they're what you act on), then news, newest first.
export function pendingSuggestionRows(db: AppDb, userId: number) {
  const rows = withApplication(db, userId)
    .where(and(eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
    .orderBy(desc(sql`coalesce(${emailEvents.receivedAt}, ${emailEvents.createdAt})`), desc(emailEvents.id))
    .all()
    .map((row) => ({ ...row, proposedStatus: liveProposal(row, row.currentStatus) }));
  // A stable sort keeps newest-first within each group.
  return rows.sort((a, b) => Number(a.proposedStatus === null) - Number(b.proposedStatus === null));
}

export type SuggestionRow = ReturnType<typeof pendingSuggestionRows>[number];

export function recentlyDecidedRows(db: AppDb, userId: number, limit = 10) {
  return withApplication(db, userId)
    .where(and(eq(emailEvents.userId, userId), sql`${emailEvents.state} != 'pending'`))
    .orderBy(desc(emailEvents.decidedAt), desc(emailEvents.id))
    .limit(limit)
    .all();
}

export function pendingSuggestionCount(db: AppDb, userId: number): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(emailEvents)
      .where(and(eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
      .get()?.n ?? 0
  );
}

export type DecideResult = { ok: true; status: Status | null } | { ok: false; message: string };

// Applies a suggestion: moves the application and marks it confirmed, in
// one transaction. What it applies is the live proposal (see above), the
// same one the card showed.
export function confirmSuggestion(db: AppDb, userId: number, id: number, now = new Date()): DecideResult {
  return db.transaction((tx) => {
    const event = tx
      .select()
      .from(emailEvents)
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
      .get();
    if (!event) return { ok: false, message: "That suggestion isn't waiting for review any more." };

    // The history records when it happened: the email's date, not today's
    // review. The ghosted rule has no email, so it's dated by confirming.
    const happenedAt = event.receivedAt ?? now;

    const markConfirmed = (applicationId: number, status: Status) =>
      // Records what was actually applied, for "Recently reviewed".
      tx.update(emailEvents)
        .set({ applicationId, state: "confirmed", decidedAt: now, proposedStatus: status })
        .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
        .run();

    let applicationId = event.applicationId;

    // About a saved job: add it to the board, like "Move to Applied" on the
    // Saved jobs page (its notes move to the application), but at the
    // status the email implies, applied as of the email's date.
    if (applicationId === null && event.jobId !== null) {
      const job = tx
        .select({ id: jobs.id, notes: jobs.notes })
        .from(jobs)
        .where(and(eq(jobs.id, event.jobId), eq(jobs.userId, userId)))
        .get();
      if (!job) return { ok: false, message: "That saved job no longer exists." };
      const existing = tx
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.jobId, job.id), eq(applications.userId, userId)))
        .get();
      if (existing) {
        // Moved to the board since the sync: treat the email as about that
        // application instead.
        applicationId = existing.id;
      } else {
        const status = proposeForSavedJob(event.emailType);
        if (!status) return { ok: false, message: "This email doesn't say where the application stands. Dismiss it instead." };
        const created = tx
          .insert(applications)
          .values({
            userId,
            jobId: job.id,
            status,
            appliedAt: event.receivedAt ?? now,
            passedScreeningAt: nextPassedScreeningAt(null, status, now),
            notes: job.notes?.trim() ? job.notes : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: applications.id })
          .get();
        tx.update(jobs).set({ notes: null }).where(and(eq(jobs.id, job.id), eq(jobs.userId, userId))).run();
        recordCreation(tx, userId, {
          applicationId: created.id,
          status,
          appliedAt: happenedAt,
          at: happenedAt,
          source: event.source,
          emailEventId: event.id,
        });
        markConfirmed(created.id, status);
        return { ok: true, status };
      }
    }

    if (applicationId === null) return { ok: false, message: "Link it to an application first." };
    const app = tx
      .select({ status: applications.status, passedScreeningAt: applications.passedScreeningAt })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .get();
    if (!app) return { ok: false, message: "That application no longer exists." };

    const status = liveProposal({ ...event, applicationId }, app.status);
    if (!status) return { ok: false, message: "There's nothing to change any more: the application has moved on. Dismiss it instead." };

    tx.update(applications)
      .set({ status, updatedAt: now, passedScreeningAt: nextPassedScreeningAt(app.passedScreeningAt, status, now) })
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .run();
    recordStatusChange(tx, userId, {
      applicationId,
      from: app.status,
      to: status,
      at: happenedAt,
      source: event.source,
      emailEventId: event.id,
    });
    markConfirmed(applicationId, status);
    return { ok: true, status };
  });
}

export function dismissSuggestion(db: AppDb, userId: number, id: number, now = new Date()): DecideResult {
  const updated = db
    .update(emailEvents)
    .set({ state: "dismissed", decidedAt: now })
    .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
    .returning({ id: emailEvents.id })
    .get();
  return updated ? { ok: true, status: null } : { ok: false, message: "That suggestion isn't waiting for review any more." };
}

export type LinkTarget = { kind: "application"; id: number } | { kind: "job"; id: number };

// Links an email to an application or saved job you picked (or corrects a
// wrong link), and works out its suggestion again for it. Later emails in
// the same thread follow the link.
export function linkSuggestion(db: AppDb, userId: number, id: number, target: LinkTarget): DecideResult {
  return db.transaction((tx) => {
    const event = tx
      .select({ emailType: emailEvents.emailType, source: emailEvents.source })
      .from(emailEvents)
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
      .get();
    if (!event || event.source !== "email") return { ok: false, message: "That suggestion can't be linked." };

    const setLink = (values: { applicationId: number | null; jobId: number | null; proposedStatus: Status | null }) =>
      tx.update(emailEvents)
        .set({ ...values, matchMethod: "manual" })
        .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
        .run();

    if (target.kind === "job") {
      const job = tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.id, target.id), eq(jobs.userId, userId)))
        .get();
      if (!job) return { ok: false, message: "That saved job wasn't found." };
      const proposed = proposeForSavedJob(event.emailType);
      setLink({ applicationId: null, jobId: job.id, proposedStatus: proposed });
      return { ok: true, status: proposed };
    }

    const app = tx
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, target.id), eq(applications.userId, userId)))
      .get();
    if (!app) return { ok: false, message: "That application wasn't found." };
    const proposed = proposeStatus(event.emailType, app.status);
    setLink({ applicationId: target.id, jobId: null, proposedStatus: proposed });
    return { ok: true, status: proposed };
  });
}

// "Add as application": creates the job and application from an email
// about one you never added, with the company, role, status, and date you
// checked in the form. The email counts as confirmed: the status came
// from it. Later emails in its thread follow the new application.
export function addApplicationFromSuggestion(
  db: AppDb,
  userId: number,
  id: number,
  input: { company: string; title: string; status: Status; appliedAt: Date; listingText?: string | null },
  now = new Date(),
): DecideResult {
  return db.transaction((tx) => {
    const event = tx
      .select({
        source: emailEvents.source,
        applicationId: emailEvents.applicationId,
        jobId: emailEvents.jobId,
        receivedAt: emailEvents.receivedAt,
      })
      .from(emailEvents)
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
      .get();
    if (!event || event.source !== "email") return { ok: false, message: "That suggestion isn't waiting for review any more." };
    if (event.applicationId !== null || event.jobId !== null) {
      return { ok: false, message: "This email is already linked. Relink it or confirm it instead." };
    }

    const job = tx
      .insert(jobs)
      .values({
        userId,
        company: input.company,
        title: input.title,
        listingText: input.listingText ?? null,
        source: "Email",
        savedAt: input.appliedAt,
      })
      .returning({ id: jobs.id })
      .get();
    const app = tx
      .insert(applications)
      .values({
        userId,
        jobId: job.id,
        status: input.status,
        appliedAt: input.appliedAt,
        passedScreeningAt: nextPassedScreeningAt(null, input.status, now),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: applications.id })
      .get();
    // Applied on the date you entered; at the email's status on its date.
    recordCreation(tx, userId, {
      applicationId: app.id,
      status: input.status,
      appliedAt: input.appliedAt,
      at: event.receivedAt ?? now,
      source: "email",
      emailEventId: id,
    });
    tx.update(emailEvents)
      .set({ applicationId: app.id, matchMethod: "manual", state: "confirmed", proposedStatus: input.status, decidedAt: now })
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
      .run();
    return { ok: true, status: input.status };
  });
}
