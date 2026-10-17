import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { applications, jobs } from "@/server/db/schema";
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "@/lib/schemas/application";
import { canTransition, type Status } from "@/lib/schemas/status";

export async function listApplicationsWithJob() {
  const db = getDb(await getMode());
  // Relational queries return a thenable query builder, not resolved rows;
  // .sync() is the terminal call for the fully-synchronous better-sqlite3
  // driver (the async form is `await` instead).
  return db.query.applications
    .findMany({
      with: { job: true },
      orderBy: [desc(applications.updatedAt)],
    })
    .sync();
}

export type ApplicationWithJob = Awaited<
  ReturnType<typeof listApplicationsWithJob>
>[number];

export async function createApplication(input: CreateApplicationInput) {
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const job = tx
      .insert(jobs)
      .values({
        company: input.company,
        title: input.title,
        url: input.url,
      })
      .returning()
      .get();

    return tx
      .insert(applications)
      .values({
        jobId: job.id,
        status: input.status,
        notes: input.notes,
      })
      .returning()
      .get();
  });
}

export async function updateApplication(input: UpdateApplicationInput) {
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({ where: eq(applications.id, input.id) })
      .sync();
    if (!existing) {
      throw new Error(`Application ${input.id} not found`);
    }

    const jobUpdates: Partial<typeof jobs.$inferInsert> = {};
    if (input.company !== undefined) jobUpdates.company = input.company;
    if (input.title !== undefined) jobUpdates.title = input.title;
    if (input.url !== undefined) jobUpdates.url = input.url;
    if (Object.keys(jobUpdates).length > 0) {
      tx.update(jobs).set(jobUpdates).where(eq(jobs.id, existing.jobId)).run();
    }

    const applicationUpdates: Partial<typeof applications.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.notes !== undefined) applicationUpdates.notes = input.notes;
    if (input.status !== undefined) applicationUpdates.status = input.status;

    return tx
      .update(applications)
      .set(applicationUpdates)
      .where(eq(applications.id, input.id))
      .returning()
      .get();
  });
}

// Stamps appliedAt the first time a card lands on "applied", since that's
// the moment the fact actually happened; leaves it alone on every other
// move so dragging a card back and forth doesn't overwrite real history.
export async function moveApplicationStatus(id: number, status: Status) {
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({ where: eq(applications.id, id) })
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
        appliedAt:
          status === "applied" && !existing.appliedAt
            ? new Date()
            : existing.appliedAt,
      })
      .where(eq(applications.id, id))
      .returning()
      .get();
  });
}

// Deletes the job row too once it has no applications left, so removing a
// card doesn't leave an orphaned job behind.
export async function deleteApplication(id: number) {
  const db = getDb(await getMode());
  db.transaction((tx) => {
    const existing = tx.query.applications
      .findFirst({ where: eq(applications.id, id) })
      .sync();
    if (!existing) return;

    tx.delete(applications).where(eq(applications.id, id)).run();

    const remaining = tx.query.applications
      .findFirst({ where: eq(applications.jobId, existing.jobId) })
      .sync();
    if (!remaining) {
      tx.delete(jobs).where(eq(jobs.id, existing.jobId)).run();
    }
  });
}
