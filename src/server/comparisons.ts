import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume, getResume } from "@/server/db/resumes";
import { getTailoringRow } from "@/server/db/tailored-resumes";
import {
  getJobForComparison,
  getLatestComparisonRow,
  getLatestTailoredComparisonRow,
  insertComparison,
  insertTailoredComparison,
  listLatestComparisonRows,
  type ComparisonRow,
} from "@/server/db/comparisons";
import { getLlmClient } from "@/server/llm/client";
import { compareResume } from "@/server/llm/compare";
import { DEMO_MODEL, getDemoComparison, getDemoTailoredComparison } from "@/server/llm/compare-demo";
import { applyResumeEdits, parseResumeLatex } from "@/lib/latex/resume";
import { resumeEditsSchema } from "@/lib/schemas/resume-edits";
import { resumePlainText } from "@/lib/cover-letter/sources";
import { comparisonSchema, type Comparison } from "@/lib/schemas/comparison";
import type { LlmError } from "@/lib/llm-result";

type StoredMeta = {
  resumeId: number;
  resumeVersion: number;
  model: string;
  // The fingerprint of the listing it compared (lib/listing.ts).
  listingHash: string | null;
  createdAt: Date;
};

// A saved comparison as the UI sees it. The stored JSON is re-validated on
// every read. A row that no longer passes the schema (e.g. written before
// a schema change) becomes "invalid" and the page offers a re-run, rather
// than crashing or trusting data of the wrong shape.
export type StoredComparison =
  | ({ status: "ok"; comparison: Comparison } & StoredMeta)
  | ({ status: "invalid" } & StoredMeta);

function toStoredComparison(row: ComparisonRow): StoredComparison {
  const meta: StoredMeta = {
    resumeId: row.resumeId,
    resumeVersion: row.resumeVersion,
    model: row.model,
    listingHash: row.listingHash,
    createdAt: row.createdAt,
  };
  const parsed = comparisonSchema.safeParse(row.result);
  return parsed.success
    ? { status: "ok", comparison: parsed.data, ...meta }
    : { status: "invalid", ...meta };
}

export async function getLatestComparison(jobId: number): Promise<StoredComparison | null> {
  const row = await getLatestComparisonRow(jobId);
  return row ? toStoredComparison(row) : null;
}

export async function listLatestComparisons(): Promise<Map<number, StoredComparison>> {
  const rows = await listLatestComparisonRows();
  return new Map([...rows].map(([jobId, row]) => [jobId, toStoredComparison(row)]));
}

export type RunComparisonError =
  | LlmError
  | {
      kind: "job_not_found" | "no_listing_text" | "no_active_resume" | "tailoring_unavailable";
      message: string;
    };

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
        message: "This job has no listing text yet. Add it on the Saved jobs page, or edit the application on the board.",
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

// ---- Comparing a tailored resume (Step 7) ----

// Scores an approved tailored resume against the same listing, so you can
// see original vs tailored. The text compared is the tailored resume
// exactly as its PDF shows it, rebuilt from the approved edits. Saved
// separately from the original comparison, which it never replaces.
//
// This writes, so its Server Action calls assertWritable() first.
export async function runTailoredComparison(tailoringId: number): Promise<RunComparisonResult> {
  const notApproved: RunComparisonResult = {
    ok: false,
    error: { kind: "tailoring_unavailable", message: "Approve the tailored resume first." },
  };
  const tailoring = await getTailoringRow(tailoringId);
  if (!tailoring || tailoring.status !== "approved") return notApproved;

  const job = await getJobForComparison(tailoring.jobId);
  if (!job) return { ok: false, error: { kind: "job_not_found", message: "This job no longer exists." } };
  if (!job.listingText) {
    return { ok: false, error: { kind: "no_listing_text", message: "This job has no listing text yet." } };
  }

  const resume = await getResume(tailoring.resumeId);
  const edits = resumeEditsSchema.safeParse(tailoring.approved);
  const applied = resume?.latexSource && edits.success ? applyResumeEdits(resume.latexSource, edits.data) : null;
  const parsed = applied?.ok ? parseResumeLatex(applied.tex) : null;
  if (!resume || !parsed?.ok) {
    return { ok: false, error: { kind: "tailoring_unavailable", message: "This tailored resume can't be rebuilt. Generate a new one." } };
  }
  const tailoredText = resumePlainText(parsed.resume);

  let comparison: Comparison;
  let model: string;
  if ((await getMode()) === "demo") {
    comparison = getDemoTailoredComparison(job.url);
    model = DEMO_MODEL;
  } else {
    const client = getLlmClient();
    if (!client.ok) return client;
    const result = await compareResume(job.listingText, tailoredText, client.data);
    if (!result.ok) return result;
    comparison = result.data.comparison;
    model = result.data.model;
  }

  const saved = await insertTailoredComparison({
    jobId: job.id,
    resumeId: resume.id,
    tailoringId: tailoring.id,
    result: comparison,
    model,
  });
  return { ok: true, comparisonId: saved.id };
}

export async function getLatestTailoredComparison(tailoringId: number): Promise<StoredComparison | null> {
  const row = await getLatestTailoredComparisonRow(tailoringId);
  return row ? toStoredComparison(row) : null;
}
