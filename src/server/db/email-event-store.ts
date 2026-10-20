// No "server-only" here, like the other *-store.ts modules: the seed and
// tests use it with their own connection. Every function takes the
// database and owner as arguments and filters by the owner; the app
// reaches it through email-events.ts and gmail-sync.ts.
import { and, asc, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, emailEvents, jobs } from "@/server/db/schema";
import { proposeStatus } from "@/lib/email/propose";
import type { GhostedInput } from "@/lib/email/ghosted";
import type { Status } from "@/lib/schemas/status";
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

export type NewEmailEvent = Omit<typeof emailEvents.$inferInsert, "id" | "userId">;

// Ignores a message already processed (the unique index), so two syncs at
// once can't create duplicates.
export function insertEmailEvent(db: AppDb, userId: number, values: NewEmailEvent): void {
  db.insert(emailEvents).values({ ...values, userId }).onConflictDoNothing().run();
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
    matchMethod: emailEvents.matchMethod,
    emailType: emailEvents.emailType,
    confidence: emailEvents.confidence,
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

// Joined to the application and job, both filtered by owner too: a link
// can only ever show your own application.
function withApplication(db: AppDb, userId: number) {
  return db
    .select(suggestionColumns())
    .from(emailEvents)
    .leftJoin(applications, and(eq(applications.id, emailEvents.applicationId), eq(applications.userId, userId)))
    .leftJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)));
}

const WAITING: readonly Status[] = ["applied", "acknowledged", "interviewing"];

// What a suggestion proposes *now*. The proposal stored at sync time is a
// snapshot; since then you may have moved the card on the board, or
// confirmed another email about the same application. Showing and
// confirming both use this, so a card never offers "Rejected ->
// Acknowledged" just because the email once meant that.
export function liveProposal(
  event: { source: "email" | "ghosted"; emailType: EmailType | null },
  current: Status | null,
): Status | null {
  if (current === null) return null;
  if (event.source === "ghosted") return WAITING.includes(current) ? "ghosted" : null;
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
    if (!event.applicationId) return { ok: false, message: "Link it to an application first." };
    const app = tx
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, event.applicationId), eq(applications.userId, userId)))
      .get();
    if (!app) return { ok: false, message: "That application no longer exists." };

    const status = liveProposal(event, app.status);
    if (!status) return { ok: false, message: "There's nothing to change any more: the application has moved on. Dismiss it instead." };

    tx.update(applications)
      .set({ status, updatedAt: now })
      .where(and(eq(applications.id, event.applicationId), eq(applications.userId, userId)))
      .run();
    // Records what was actually applied, for "Recently reviewed".
    tx.update(emailEvents)
      .set({ state: "confirmed", decidedAt: now, proposedStatus: status })
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
      .run();
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

// Links an email to an application you picked (or corrects a wrong link),
// and works out its suggestion again for that application. Later emails
// in the same thread follow the link.
export function linkSuggestion(db: AppDb, userId: number, id: number, applicationId: number): DecideResult {
  return db.transaction((tx) => {
    const event = tx
      .select({ emailType: emailEvents.emailType, source: emailEvents.source })
      .from(emailEvents)
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId), eq(emailEvents.state, "pending")))
      .get();
    if (!event || event.source !== "email") return { ok: false, message: "That suggestion can't be linked." };
    const app = tx
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .get();
    if (!app) return { ok: false, message: "That application wasn't found." };

    const proposed = proposeStatus(event.emailType, app.status);
    tx.update(emailEvents)
      .set({ applicationId, matchMethod: "manual", proposedStatus: proposed })
      .where(and(eq(emailEvents.id, id), eq(emailEvents.userId, userId)))
      .run();
    return { ok: true, status: proposed };
  });
}
