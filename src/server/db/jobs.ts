import "server-only";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { applications, jobs } from "@/server/db/schema";
import { toApplication } from "@/lib/saved-job";
import { recordCreation } from "@/server/db/status-history-store";
import type {
  CreateSavedJobInput,
  UpdateSavedJobInput,
} from "@/lib/schemas/job";

// "Saved" means the job has no application row. Every query and write in
// this file filters on that, so the Saved page can never edit or delete a
// job that's already on the board. Every query also filters on the
// current user (requireUserId), so an id from a form can only ever reach
// your own rows: someone else's id simply isn't found.
const hasNoApplication = notExists(
  sql`(select 1 from ${applications} where ${applications.jobId} = ${jobs.id})`,
);

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function listSavedJobs() {
  const { db, userId } = await scope();
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), hasNoApplication))
    .orderBy(desc(jobs.savedAt))
    .all();
}

export type SavedJob = Awaited<ReturnType<typeof listSavedJobs>>[number];

export async function getSavedJob(id: number) {
  const { db, userId } = await scope();
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId), hasNoApplication))
    .get();
}

export async function createSavedJob(input: CreateSavedJobInput) {
  const { db, userId } = await scope();
  return db
    .insert(jobs)
    .values({
      userId,
      company: input.company,
      title: input.title,
      url: input.url,
      listingText: input.listingText,
      notes: input.notes,
    })
    .returning()
    .get();
}

// Full replace of the editable fields (see updateSavedJobSchema): a blank
// optional field arrives as undefined and is stored as null. Drizzle
// skips undefined values in .set(), so the `?? null` is what actually
// clears a field.
export async function updateSavedJob(input: UpdateSavedJobInput) {
  const { db, userId } = await scope();
  const updated = db
    .update(jobs)
    .set({
      company: input.company,
      title: input.title,
      url: input.url ?? null,
      listingText: input.listingText ?? null,
      notes: input.notes ?? null,
    })
    .where(and(eq(jobs.id, input.id), eq(jobs.userId, userId), hasNoApplication))
    .returning()
    .get();
  if (!updated) throw new Error(`Saved job ${input.id} not found`);
  return updated;
}

export async function deleteSavedJob(id: number) {
  const { db, userId } = await scope();
  db.delete(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId), hasNoApplication))
    .run();
}

export type MoveToAppliedResult =
  | { ok: true; applicationId: number }
  | { ok: false; reason: "not_found" | "already_applied" };

// One transaction so the check and the insert can't race (e.g. a double
// click creating two applications). The rules live in toApplication();
// this function only does the I/O around it. The job's notes move to the
// application rather than being copied, so there's one copy to edit.
export async function moveSavedJobToApplied(
  id: number,
  now: Date,
): Promise<MoveToAppliedResult> {
  const { db, userId } = await scope();
  return db.transaction((tx) => {
    const job = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
      .get();
    if (!job) return { ok: false, reason: "not_found" };

    const { count } = tx
      .select({ count: sql<number>`count(*)` })
      .from(applications)
      .where(and(eq(applications.jobId, id), eq(applications.userId, userId)))
      .get() ?? { count: 0 };

    const result = toApplication(
      { id: job.id, notes: job.notes, applicationCount: count },
      now,
    );
    if (!result.ok) return result;

    const application = tx
      .insert(applications)
      .values({ ...result.application, userId })
      .returning()
      .get();
    recordCreation(tx, userId, {
      applicationId: application.id,
      status: application.status,
      appliedAt: application.appliedAt,
      at: now,
      source: "board",
    });
    tx.update(jobs)
      .set({ notes: null })
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
      .run();

    return { ok: true, applicationId: application.id };
  });
}
