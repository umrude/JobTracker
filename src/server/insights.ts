import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { env } from "@/server/env";
import { requireUserId } from "@/server/current-user";
import { insightInputs, jobsToCompare, pipelineInputs } from "@/server/db/insights-store";
import { getActiveResume } from "@/server/db/resumes";
import { runComparison } from "@/server/comparisons";
import { buildInsights, type Insights, type InsightScope } from "@/lib/insights/build";
import { estimateComparisonUsd } from "@/lib/llm-pricing";
import { buildPipeline, type Pipeline } from "@/lib/insights/pipeline";

// The Insights page (docs/insights.md): its numbers, and "Compare all" for
// jobs with a listing that haven't been compared yet.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

export async function getInsights(scopeName: InsightScope): Promise<Insights> {
  const { db, userId } = await scope();
  const { jobs, profileSkills } = insightInputs(db, userId);
  return buildInsights(jobs, profileSkills, scopeName);
}

// How applications move through the search: the funnel and time in each
// stage, from the status history. Every application counts, listing or
// not, so it doesn't follow the page's "Which listings" choice.
export async function getPipeline(now = new Date()): Promise<Pipeline> {
  const { db, userId } = await scope();
  return buildPipeline(pipelineInputs(db, userId, now));
}

export type CompareAllPlan = {
  count: number;
  // Rough, and on the high side; null if the model's price isn't known.
  estimateUsd: number | null;
  model: string;
  demo: boolean;
};

// What "Compare all" would do, for its confirm step: how many, with which
// model, and roughly what it costs. Demo comparisons are canned and free.
export async function getCompareAllPlan(): Promise<CompareAllPlan> {
  const { db, userId } = await scope();
  const demo = (await getMode()) === "demo";
  const pending = jobsToCompare(db, userId);
  const resume = await getActiveResume();
  let estimateUsd: number | null = 0;
  for (const job of pending) {
    const cost = demo ? 0 : estimateComparisonUsd(env.ANTHROPIC_MODEL, job.listingText, resume?.text ?? "");
    estimateUsd = cost === null || estimateUsd === null ? null : estimateUsd + cost;
  }
  return { count: pending.length, estimateUsd, model: demo ? "demo" : env.ANTHROPIC_MODEL, demo };
}

export type BatchResult = {
  compared: number;
  // Jobs that couldn't be compared (the model declined, odd output): the
  // page skips them for the rest of this run.
  failed: { jobId: number; company: string; message: string }[];
  remaining: number;
  // Set when the run should stop: no credits, no key, no resume, API down.
  stopped: string | null;
};

// How many comparisons run at once. Each takes 15 to 40 seconds, so a
// batch returns in well under a minute, and the page shows progress and
// can stop between batches.
export const COMPARE_BATCH = 3;

// Errors that mean no comparison can work right now, as in Gmail sync.
const STOPS_RUN = new Set(["missing_api_key", "out_of_credits", "api_error", "no_active_resume"]);

// Compares the next few jobs that need it. The page calls this repeatedly
// ("Compare all"); it picks the jobs itself, so the browser never sends a
// list of ids, only the ones that already failed in this run, to skip.
export async function compareNextBatch(skip: readonly number[]): Promise<BatchResult> {
  const { db, userId } = await scope();
  const skipped = new Set(skip);
  const pending = jobsToCompare(db, userId).filter((job) => !skipped.has(job.jobId));
  const batch = pending.slice(0, COMPARE_BATCH);

  const results = await Promise.all(batch.map((job) => runComparison(job.jobId)));
  const result: BatchResult = { compared: 0, failed: [], remaining: pending.length - batch.length, stopped: null };
  results.forEach((outcome, index) => {
    if (outcome.ok) {
      result.compared++;
      return;
    }
    if (STOPS_RUN.has(outcome.error.kind)) {
      result.stopped = outcome.error.message;
      // Not compared, so it's still remaining.
      result.remaining++;
      return;
    }
    result.failed.push({ jobId: batch[index].jobId, company: batch[index].company, message: outcome.error.message });
  });
  return result;
}
