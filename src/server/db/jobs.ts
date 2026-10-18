import "server-only";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { applications, jobs } from "@/server/db/schema";
import { toApplication } from "@/lib/saved-job";
import type {
  CreateSavedJobInput,
  UpdateSavedJobInput,
} from "@/lib/schemas/job";

// "Saved" means the job has no application row. Every query and write in
// this file filters on that, so the Saved page can never edit or delete a
// job that's already on the board.
const hasNoApplication = notExists(
  sql`(select 1 from ${applications} where ${applications.jobId} = ${jobs.id})`,
);

export async function listSavedJobs() {
  const db = getDb(await getMode());
  return db
    .select()
    .from(jobs)
    .where(hasNoApplication)
    .orderBy(desc(jobs.savedAt))
    .all();
}

export type SavedJob = Awaited<ReturnType<typeof listSavedJobs>>[number];

export async function getSavedJob(id: number) {
  const db = getDb(await getMode());
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), hasNoApplication))
    .get();
}

export async function createSavedJob(input: CreateSavedJobInput) {
  const db = getDb(await getMode());
  return db
    .insert(jobs)
    .values({
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
  const db = getDb(await getMode());
  const updated = db
    .update(jobs)
    .set({
      company: input.company,
      title: input.title,
      url: input.url ?? null,
      listingText: input.listingText ?? null,
      notes: input.notes ?? null,
    })
    .where(and(eq(jobs.id, input.id), hasNoApplication))
    .returning()
    .get();
  if (!updated) throw new Error(`Saved job ${input.id} not found`);
  return updated;
}

export async function deleteSavedJob(id: number) {
  const db = getDb(await getMode());
  db.delete(jobs).where(and(eq(jobs.id, id), hasNoApplication)).run();
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
  const db = getDb(await getMode());
  return db.transaction((tx) => {
    const job = tx.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) return { ok: false, reason: "not_found" };

    const { count } = tx
      .select({ count: sql<number>`count(*)` })
      .from(applications)
      .where(eq(applications.jobId, id))
      .get() ?? { count: 0 };

    const result = toApplication(
      { id: job.id, notes: job.notes, applicationCount: count },
      now,
    );
    if (!result.ok) return result;

    const application = tx
      .insert(applications)
      .values(result.application)
      .returning()
      .get();
    tx.update(jobs).set({ notes: null }).where(eq(jobs.id, id)).run();

    return { ok: true, applicationId: application.id };
  });
}
