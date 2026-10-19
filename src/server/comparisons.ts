import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume } from "@/server/db/resumes";
import { getJobForComparison, insertComparison } from "@/server/db/comparisons";
import { getLlmClient } from "@/server/llm/client";
import { compareResume } from "@/server/llm/compare";
import { DEMO_MODEL, getDemoComparison } from "@/server/llm/compare-demo";
import type { LlmError } from "@/lib/llm-result";

export type RunComparisonError =
  | LlmError
  | { kind: "job_not_found" | "no_listing_text" | "no_active_resume"; message: string };

export type RunComparisonResult =
  | { ok: true; comparisonId: number }
  | { ok: false; error: RunComparisonError };

// Runs a comparison for one job against the active resume and saves it.
// The demo/live decision is made here, not inside compareResume, so
// compareResume stays a pure "call the model and validate" function that's
// easy to test with a fake client.
//
// This writes, so the Server Action that calls it must call
// assertWritable() first (the local demo preview is writable; the public
// demo deployment isn't).
export async function runComparison(jobId: number): Promise<RunComparisonResult> {
  const job = await getJobForComparison(jobId);
  if (!job) {
    return { ok: false, error: { kind: "job_not_found", message: "This job no longer exists." } };
  }
  if (!job.listingText) {
    return {
      ok: false,
      error: {
        kind: "no_listing_text",
        message: "This job has no listing text yet. Add it on the Saved jobs page first.",
      },
    };
  }

  const resume = await getActiveResume();
  if (!resume) {
    return {
      ok: false,
      error: {
        kind: "no_active_resume",
        message: "Upload a resume first. Comparisons use your active resume.",
      },
    };
  }

  // Demo mode returns canned results and makes no network calls.
  if ((await getMode()) === "demo") {
    const saved = await insertComparison({
      jobId: job.id,
      resumeId: resume.id,
      result: getDemoComparison(job.url),
      model: DEMO_MODEL,
    });
    return { ok: true, comparisonId: saved.id };
  }

  const client = getLlmClient();
  if (!client.ok) return client;

  const result = await compareResume(job.listingText, resume.text, client.data);
  if (!result.ok) return result;

  const saved = await insertComparison({
    jobId: job.id,
    resumeId: resume.id,
    result: result.data.comparison,
    model: result.data.model,
  });
  return { ok: true, comparisonId: saved.id };
}
