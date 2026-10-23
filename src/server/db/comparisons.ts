import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { applications, comparisons, jobs, resumes } from "@/server/db/schema";
import { insertComparisonWithSkills, insertTailoredComparisonRow } from "@/server/db/comparison-store";
import type { Comparison } from "@/lib/schemas/comparison";

// Every query filters on the current user (requireUserId).
async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function getJobForComparison(id: number) {
  const { db, userId } = await scope();
  return db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      url: jobs.url,
      listingText: jobs.listingText,
      // The job's application, if you've applied: the page shows its
      // status, or "Move to Applied" while it's still a saved job. The join
      // is scoped to you too, so it can never pick up someone else's row.
      applicationStatus: applications.status,
      applicationId: applications.id,
    })
    .from(jobs)
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.userId, userId)))
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .get();
}

// Takes the validated Comparison type, so only output that passed
// comparisonSchema can be written. Reads get `unknown` back and must
// re-validate (see the comment on comparisons.result in schema.ts). The
// job and resume ids come from owner-scoped reads in runComparison; the
// owner is stamped here, never taken from the caller. The comparison's
// normalized skill rows are saved with it (see comparison-store.ts).
export async function insertComparison(input: {
  jobId: number;
  resumeId: number;
  result: Comparison;
  model: string;
}) {
  const { db, userId } = await scope();
  return insertComparisonWithSkills(db, userId, input);
}

const comparisonColumns = {
  id: comparisons.id,
  jobId: comparisons.jobId,
  resumeId: comparisons.resumeId,
  resumeVersion: resumes.version,
  result: comparisons.result,
  model: comparisons.model,
  listingHash: comparisons.listingHash,
  createdAt: comparisons.createdAt,
};

// Newest first; id breaks ties, since createdAt only has one-second
// resolution and a quick re-run can land in the same second.
const newestFirst = [desc(comparisons.createdAt), desc(comparisons.id)];

export async function getLatestComparisonRow(jobId: number) {
  const { db, userId } = await scope();
  return db
    .select(comparisonColumns)
    .from(comparisons)
    .innerJoin(resumes, eq(resumes.id, comparisons.resumeId))
    .where(and(eq(comparisons.jobId, jobId), eq(comparisons.userId, userId), isNull(comparisons.tailoringId)))
    .orderBy(...newestFirst)
    .limit(1)
    .get();
}

export type ComparisonRow = NonNullable<Awaited<ReturnType<typeof getLatestComparisonRow>>>;

// The newest comparison of one approved tailored resume (Step 7). The
// queries above only ever return comparisons of the resume as written.
export async function getLatestTailoredComparisonRow(tailoringId: number) {
  const { db, userId } = await scope();
  return db
    .select(comparisonColumns)
    .from(comparisons)
    .innerJoin(resumes, eq(resumes.id, comparisons.resumeId))
    .where(and(eq(comparisons.tailoringId, tailoringId), eq(comparisons.userId, userId)))
    .orderBy(...newestFirst)
    .limit(1)
    .get();
}

export async function insertTailoredComparison(input: {
  jobId: number;
  resumeId: number;
  tailoringId: number;
  result: Comparison;
  model: string;
}) {
  const { db, userId } = await scope();
  return insertTailoredComparisonRow(db, userId, input);
}

// The latest comparison for every job that has one, for the Compare index.
// Picking the first row per job in code keeps the query simple; with one
// user's job list, the row count stays small.
export async function listLatestComparisonRows(): Promise<Map<number, ComparisonRow>> {
  const { db, userId } = await scope();
  const rows = db
    .select(comparisonColumns)
    .from(comparisons)
    .innerJoin(resumes, eq(resumes.id, comparisons.resumeId))
    .where(and(eq(comparisons.userId, userId), isNull(comparisons.tailoringId)))
    .orderBy(...newestFirst)
    .all();

  const latest = new Map<number, ComparisonRow>();
  for (const row of rows) {
    if (!latest.has(row.jobId)) latest.set(row.jobId, row);
  }
  return latest;
}
