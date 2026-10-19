import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { comparisons, jobs, resumes } from "@/server/db/schema";
import type { Comparison } from "@/lib/schemas/comparison";

export async function getJobForComparison(id: number) {
  const db = getDb(await getMode());
  return db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      url: jobs.url,
      listingText: jobs.listingText,
    })
    .from(jobs)
    .where(eq(jobs.id, id))
    .get();
}

// Takes the validated Comparison type, so only output that passed
// comparisonSchema can be written. Reads get `unknown` back and must
// re-validate (see the comment on comparisons.result in schema.ts).
export async function insertComparison(input: {
  jobId: number;
  resumeId: number;
  result: Comparison;
  model: string;
}) {
  const db = getDb(await getMode());
  return db.insert(comparisons).values(input).returning({ id: comparisons.id }).get();
}

const comparisonColumns = {
  id: comparisons.id,
  jobId: comparisons.jobId,
  resumeId: comparisons.resumeId,
  resumeVersion: resumes.version,
  result: comparisons.result,
  model: comparisons.model,
  createdAt: comparisons.createdAt,
};

// Newest first; id breaks ties, since createdAt only has one-second
// resolution and a quick re-run can land in the same second.
const newestFirst = [desc(comparisons.createdAt), desc(comparisons.id)];

export async function getLatestComparisonRow(jobId: number) {
  const db = getDb(await getMode());
  return db
    .select(comparisonColumns)
    .from(comparisons)
    .innerJoin(resumes, eq(resumes.id, comparisons.resumeId))
    .where(eq(comparisons.jobId, jobId))
    .orderBy(...newestFirst)
    .limit(1)
    .get();
}

export type ComparisonRow = NonNullable<Awaited<ReturnType<typeof getLatestComparisonRow>>>;

// The latest comparison for every job that has one, for the Compare index.
// Picking the first row per job in code keeps the query simple; with one
// person's job list, the row count stays small.
export async function listLatestComparisonRows(): Promise<Map<number, ComparisonRow>> {
  const db = getDb(await getMode());
  const rows = db
    .select(comparisonColumns)
    .from(comparisons)
    .innerJoin(resumes, eq(resumes.id, comparisons.resumeId))
    .orderBy(...newestFirst)
    .all();

  const latest = new Map<number, ComparisonRow>();
  for (const row of rows) {
    if (!latest.has(row.jobId)) latest.set(row.jobId, row);
  }
  return latest;
}
