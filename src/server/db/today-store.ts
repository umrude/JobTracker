// No "server-only": the seed and tests use this with their own connection.
// Like every *-store.ts, it takes the user id explicitly; the app reaches
// it through server/db/today.ts, which passes requireUserId().
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import { applications, emailEvents, interviews, jobs, statusEvents } from "@/server/db/schema";
import type { CreateInterviewInput } from "@/lib/schemas/interview";
import type { FollowUpCandidate } from "@/lib/today";

type AppDb = BetterSQLite3Database<typeof schema>;

export type WriteResult = { ok: true } | { ok: false; message: string };
const GONE: WriteResult = { ok: false, message: "That application no longer exists." };

// ---- Interviews ----

// The application must be yours: checked here, not trusted from the form.
export function insertInterview(db: AppDb, userId: number, input: CreateInterviewInput): WriteResult {
  return db.transaction((tx) => {
    const application = tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)))
      .get();
    if (!application) return GONE;
    tx.insert(interviews)
      .values({
        userId,
        applicationId: application.id,
        at: input.at,
        durationMinutes: input.durationMinutes,
        kind: input.kind,
        location: input.location ?? null,
        notes: input.notes ?? null,
      })
      .run();
    return { ok: true };
  });
}

export function deleteInterview(db: AppDb, userId: number, id: number): WriteResult {
  const deleted = db
    .delete(interviews)
    .where(and(eq(interviews.id, id), eq(interviews.userId, userId)))
    .returning({ id: interviews.id })
    .get();
  return deleted ? { ok: true } : { ok: false, message: "That interview no longer exists." };
}

const interviewColumns = {
  id: interviews.id,
  applicationId: interviews.applicationId,
  at: interviews.at,
  durationMinutes: interviews.durationMinutes,
  kind: interviews.kind,
  location: interviews.location,
  notes: interviews.notes,
};

// One application's interviews, soonest first (its page).
export function interviewsForApplication(db: AppDb, userId: number, applicationId: number) {
  return db
    .select(interviewColumns)
    .from(interviews)
    .where(and(eq(interviews.userId, userId), eq(interviews.applicationId, applicationId)))
    .orderBy(asc(interviews.at), asc(interviews.id))
    .all();
}

export type Interview = ReturnType<typeof interviewsForApplication>[number];

// Interviews from `from` on, soonest first, with what they're for (Today,
// and the calendar file).
export function upcomingInterviews(db: AppDb, userId: number, from: Date, limit = 20) {
  return withApplication(db, userId)
    .where(and(eq(interviews.userId, userId), gte(interviews.at, from)))
    .orderBy(asc(interviews.at), asc(interviews.id))
    .limit(limit)
    .all();
}

export type UpcomingInterview = ReturnType<typeof upcomingInterviews>[number];

export function interviewWithApplication(db: AppDb, userId: number, id: number) {
  return withApplication(db, userId)
    .where(and(eq(interviews.id, id), eq(interviews.userId, userId)))
    .get();
}

function withApplication(db: AppDb, userId: number) {
  return db
    .select({ ...interviewColumns, company: jobs.company, title: jobs.title })
    .from(interviews)
    .innerJoin(applications, and(eq(applications.id, interviews.applicationId), eq(applications.userId, userId)))
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)));
}

// ---- Follow-ups ----

// Everything followUpsDue (lib/today.ts) needs, for applications still
// waiting to hear back. The latest status change and email are worked out
// in SQL, one row per application.
export function followUpCandidates(db: AppDb, userId: number): FollowUpCandidate[] {
  const lastStatusChangeAt = sql<number | null>`(
    select max(${statusEvents.at}) from ${statusEvents}
    where ${statusEvents.applicationId} = ${applications.id} and ${statusEvents.userId} = ${userId}
  )`;
  const lastEmailAt = sql<number | null>`(
    select max(coalesce(${emailEvents.receivedAt}, ${emailEvents.createdAt})) from ${emailEvents}
    where ${emailEvents.applicationId} = ${applications.id} and ${emailEvents.userId} = ${userId}
      and ${emailEvents.source} = 'email'
  )`;
  const ghostedSuggested = sql<number>`exists (
    select 1 from ${emailEvents}
    where ${emailEvents.applicationId} = ${applications.id} and ${emailEvents.userId} = ${userId}
      and ${emailEvents.source} = 'ghosted' and ${emailEvents.state} = 'pending'
  )`;
  const toDate = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000));

  return db
    .select({
      applicationId: applications.id,
      company: jobs.company,
      title: jobs.title,
      status: applications.status,
      appliedAt: applications.appliedAt,
      createdAt: applications.createdAt,
      followedUpAt: applications.followedUpAt,
      lastStatusChangeAt,
      lastEmailAt,
      ghostedSuggested,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)))
    .where(and(eq(applications.userId, userId), inArray(applications.status, ["applied", "acknowledged"])))
    .all()
    .map((row) => ({
      ...row,
      lastStatusChangeAt: toDate(row.lastStatusChangeAt),
      lastEmailAt: toDate(row.lastEmailAt),
      ghostedSuggested: Boolean(row.ghostedSuggested),
    }));
}

// "I followed up": the nudge goes away, and comes back after another quiet
// stretch.
export function markFollowedUp(db: AppDb, userId: number, applicationId: number, now: Date): WriteResult {
  const updated = db
    .update(applications)
    .set({ followedUpAt: now })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .returning({ id: applications.id })
    .get();
  return updated ? { ok: true } : GONE;
}

// ---- Recent activity ----

// Status changes dated since `since`, newest first, from the history.
export function recentActivity(db: AppDb, userId: number, since: Date, limit = 15) {
  return db
    .select({
      id: statusEvents.id,
      applicationId: statusEvents.applicationId,
      from: statusEvents.fromStatus,
      to: statusEvents.toStatus,
      at: statusEvents.at,
      source: statusEvents.source,
      company: jobs.company,
      title: jobs.title,
    })
    .from(statusEvents)
    .innerJoin(applications, and(eq(applications.id, statusEvents.applicationId), eq(applications.userId, userId)))
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)))
    .where(and(eq(statusEvents.userId, userId), gte(statusEvents.at, since)))
    .orderBy(desc(statusEvents.at), desc(statusEvents.id))
    .limit(limit)
    .all();
}

export type ActivityRow = ReturnType<typeof recentActivity>[number];
