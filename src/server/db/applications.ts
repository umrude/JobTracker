import "server-only";
import { and, desc, eq } from "drizzle-orm";
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

// Every query filters on the current user (requireUserId), so an id from
// a form or a drag-and-drop can only ever reach your own rows: someone
// else's id simply isn't found.
async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function listApplicationsWithJob() {
  const { db, userId } = await scope();
  // Relational queries return a thenable query builder, not resolved rows;
  // .sync() is the terminal call for the fully-synchronous better-sqlite3
  // driver (the async form is `await` instead).
  return db.query.applications
    .findMany({
      where: eq(applications.userId, userId),
      with: { job: true },
      orderBy: [desc(applications.updatedAt)],
    })
    .sync();
}

export type ApplicationWithJob = Awaited<
  ReturnType<typeof listApplicationsWithJob>
>[number];

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

    return tx
      .insert(applications)
      .values({
        userId,
        jobId: job.id,
        status: input.status,
        notes: input.notes,
        passedScreeningAt: nextPassedScreeningAt(null, input.status, new Date(), input.passedScreening),
      })
      .returning()
      .get();
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

    const applicationUpdates: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.notes !== undefined) applicationUpdates.notes = input.notes;
    if (input.status !== undefined) applicationUpdates.status = input.status;
    applicationUpdates.passedScreeningAt = nextPassedScreeningAt(
      existing.passedScreeningAt,
      input.status ?? existing.status,
      new Date(),
      input.passedScreening,
    );

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

    return tx
      .update(applications)
      .set({
        status,
        updatedAt: new Date(),
        passedScreeningAt: nextPassedScreeningAt(existing.passedScreeningAt, status, new Date()),
        appliedAt:
          status === "applied" && !existing.appliedAt
            ? new Date()
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
