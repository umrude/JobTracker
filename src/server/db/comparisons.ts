import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { comparisons, jobs } from "@/server/db/schema";
import type { Comparison } from "@/lib/schemas/comparison";

export async function getJobForComparison(id: number) {
  const db = getDb(await getMode());
  return db
    .select({ id: jobs.id, url: jobs.url, listingText: jobs.listingText })
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
