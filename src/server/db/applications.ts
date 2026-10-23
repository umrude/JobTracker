import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { applications, jobs } from "@/server/db/schema";
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "@/lib/schemas/application";
import { canTransition, type Status } from "@/lib/schemas/status";
import { nextPassedScreeningAt } from "@/lib/screening";
import { listStatusHistory, recordCreation, recordStatusChange } from "@/server/db/status-history-store";

// Every query filters on the current user (requireUserId), so an id from
// a form or a drag-and-drop can only ever reach your own rows: someone
// else's id simply isn't found.
async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

// What a list of applications needs (the board's cards, pickers, the
// Compare page): no listing text or notes. The board is a Client
// Component, so everything it's given is sent to the browser; with real
// listings (3,000 to 10,000 characters each), full rows made the board
// megabytes. "Has a listing" is worked out in SQL instead.
// See docs/performance.md.
export async function listApplicationSummaries() {
  const { db, userId } = await scope();
  return db
    .select({
      id: applications.id,
      jobId: applications.jobId,
      status: applications.status,
      company: jobs.company,
      title: jobs.title,
      hasListing: sql<number>`coalesce(trim(${jobs.listingText}), '') != ''`.mapWith(Boolean),
      passedScreening: sql<number>`${applications.passedScreeningAt} is not null`.mapWith(Boolean),
      updatedAt: applications.updatedAt,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt), desc(applications.id))
    .all();
}

export type ApplicationSummary = Awaited<ReturnType<typeof listApplicationSummaries>>[number];

// One application in full: for the edit dialog (loaded when it opens) and
// the application's page.
export async function getApplicationDetails(id: number) {
  const { db, userId } = await scope();
  return db
    .select({
      id: applications.id,
      jobId: applications.jobId,
      status: applications.status,
      appliedAt: applications.appliedAt,
      notes: applications.notes,
      passedScreening: sql<number>`${applications.passedScreeningAt} is not null`.mapWith(Boolean),
      company: jobs.company,
      title: jobs.title,
      url: jobs.url,
      listingText: jobs.listingText,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)))
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .get();
}

export type ApplicationDetails = NonNullable<Awaited<ReturnType<typeof getApplicationDetails>>>;

// An application's status history, oldest first (docs/status-history.md).
// Empty for another user's application, like every read here.
export async function getStatusHistory(applicationId: number) {
  const { db, userId } = await scope();
  return listStatusHistory(db, userId, applicationId);
}

export async function createApplication(input: CreateApplicationInput) {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const job = tx
      .insert(jobs)
      .values({
        userId,
        company: input.company,
        title: input.title,
        url: input.url,
        listingText: input.listingText,
      })
      .returning()
      .get();

    const now = new Date();
    const application = tx
      .insert(applications)
      .values({
        userId,
        jobId: job.id,
        status: input.status,
        notes: input.notes,
        passedScreeningAt: nextPassedScreeningAt(null, input.status, now, input.passedScreening),
      })
      .returning()
      .get();
    recordCreation(tx, userId, { applicationId: application.id, status: input.status, appliedAt: null, at: now, source: "board" });
    return application;
  });
}

export async function updateApplication(input: UpdateApplicationInput) {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({
        where: and(eq(applications.id, input.id), eq(applications.userId, userId)),
      })
      .sync();
    if (!existing) {
      throw new Error(`Application ${input.id} not found`);
    }

    const jobUpdates: Partial<typeof jobs.$inferInsert> = {};
    if (input.company !== undefined) jobUpdates.company = input.company;
    if (input.title !== undefined) jobUpdates.title = input.title;
    if (input.url !== undefined) jobUpdates.url = input.url;
    if (input.listingText !== undefined) jobUpdates.listingText = input.listingText.trim() === "" ? null : input.listingText;
    if (Object.keys(jobUpdates).length > 0) {
      tx.update(jobs)
        .set(jobUpdates)
        .where(and(eq(jobs.id, existing.jobId), eq(jobs.userId, userId)))
        .run();
    }

    const now = new Date();
    const applicationUpdates: Partial<typeof applications.$inferInsert> = {
      updatedAt: now,
    };
    if (input.notes !== undefined) applicationUpdates.notes = input.notes;
    if (input.status !== undefined) applicationUpdates.status = input.status;
    applicationUpdates.passedScreeningAt = nextPassedScreeningAt(
      existing.passedScreeningAt,
      input.status ?? existing.status,
      now,
      input.passedScreening,
    );

    if (input.status !== undefined) {
      recordStatusChange(tx, userId, { applicationId: existing.id, from: existing.status, to: input.status, at: now, source: "board" });
    }
    return tx
      .update(applications)
      .set(applicationUpdates)
      .where(and(eq(applications.id, input.id), eq(applications.userId, userId)))
      .returning()
      .get();
  });
}

// Stamps appliedAt the first time a card lands on "applied", since that's
// the moment the fact actually happened; leaves it alone on every other
// move so dragging a card back and forth doesn't overwrite real history.
export async function moveApplicationStatus(id: number, status: Status) {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({ where: and(eq(applications.id, id), eq(applications.userId, userId)) })
      .sync();
    if (!existing) {
      throw new Error(`Application ${id} not found`);
    }
    if (!canTransition(existing.status, status)) {
      throw new Error(`Cannot move application from ${existing.status} to ${status}`);
    }

    const now = new Date();
    recordStatusChange(tx, userId, { applicationId: existing.id, from: existing.status, to: status, at: now, source: "board" });
    return tx
      .update(applications)
      .set({
        status,
        updatedAt: now,
        passedScreeningAt: nextPassedScreeningAt(existing.passedScreeningAt, status, now),
        appliedAt:
          status === "applied" && !existing.appliedAt
            ? now
            : existing.appliedAt,
      })
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .returning()
      .get();
  });
}

// Deletes the job row too once it has no applications left, so removing a
// card doesn't leave an orphaned job behind.
export async function deleteApplication(id: number) {
  const { db, userId } = await scope();
  db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({ where: and(eq(applications.id, id), eq(applications.userId, userId)) })
      .sync();
    if (!existing) return;

    tx.delete(applications)
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .run();

    const remaining = tx.query.applications
      .findFirst({
        where: and(eq(applications.jobId, existing.jobId), eq(applications.userId, userId)),
      })
      .sync();
    if (!remaining) {
      tx.delete(jobs)
        .where(and(eq(jobs.id, existing.jobId), eq(jobs.userId, userId)))
        .run();
    }
  });
}
