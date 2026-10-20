import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume } from "@/server/db/resumes";
import { getJobForComparison } from "@/server/db/comparisons";
import { loadProfile } from "@/server/db/profile";
import { createTailoringDraft, getLatestTailoringRow } from "@/server/db/tailored-resumes";
import { getLatestComparison } from "@/server/comparisons";
import { getLlmClient } from "@/server/llm/client";
import { tailorResume } from "@/server/llm/tailor";
import { getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { DEMO_MODEL } from "@/server/llm/compare-demo";
import { parseResumeLatex } from "@/lib/latex/resume";
import type { LlmError } from "@/lib/llm-result";
import { createSkillResolver } from "@/lib/skills/resolver";
import { checkIssueSchema, tailoringProposalSchema, type CheckIssue, type TailoringProposal } from "@/lib/schemas/tailoring";
import { checkProposal } from "@/lib/tailoring/check";

export type RunTailoringError =
  | LlmError
  | {
      kind: "job_not_found" | "no_listing_text" | "no_active_resume" | "no_latex" | "unsupported_template" | "empty_profile";
      message: string;
    };

export type RunTailoringResult = { ok: true; tailoringId: number } | { ok: false; error: RunTailoringError };

const fail = (kind: Exclude<RunTailoringError["kind"], LlmError["kind"]>, message: string): RunTailoringResult => ({
  ok: false,
  error: { kind, message },
});

// Proposes a tailored resume for one job and saves it as a draft for
// review. The demo/live decision is made here, like runComparison, so
// tailorResume stays easy to test with a fake client. Demo proposals go
// through the same honesty checker as real ones.
//
// This writes, so the Server Action that calls it must call
// assertWritable() first.
export async function runTailoring(jobId: number): Promise<RunTailoringResult> {
  const job = await getJobForComparison(jobId);
  if (!job) return fail("job_not_found", "This job no longer exists.");
  if (!job.listingText) return fail("no_listing_text", "This job has no listing text yet. Add it on the Saved jobs page first.");

  const resume = await getActiveResume();
  if (!resume) return fail("no_active_resume", "Upload a resume first. Tailoring starts from your active resume.");
  if (!resume.latexSource) return fail("no_latex", "Upload your .tex to enable tailored resumes.");
  const tex = parseResumeLatex(resume.latexSource);
  if (!tex.ok) return fail("unsupported_template", tex.message);

  const profile = await loadProfile();
  if (profile.entries.length === 0 && profile.skills.length === 0) {
    return fail("empty_profile", "Your profile is empty. Import your resume on the Profile page first.");
  }
  const context = { profile, tex: tex.resume, resolver: createSkillResolver(profile.skills) };

  // Demo mode: canned proposals, still checked. No network calls.
  if ((await getMode()) === "demo") {
    const checked = checkProposal(resolveDemoProposal(getDemoTailoring(job.url), profile, tex.resume), context);
    const saved = await createTailoringDraft({ jobId: job.id, resumeId: resume.id, ...checked, model: DEMO_MODEL });
    return { ok: true, tailoringId: saved.id };
  }

  const client = getLlmClient();
  if (!client.ok) return client;

  const latest = await getLatestComparison(job.id);
  const comparison =
    latest?.status === "ok"
      ? { matchedSkills: latest.comparison.matchedSkills, missingSkills: latest.comparison.missingSkills }
      : null;

  const result = await tailorResume({ listing: job.listingText, context, comparison }, client.data);
  if (!result.ok) return result;

  const saved = await createTailoringDraft({ jobId: job.id, resumeId: resume.id, ...result.data });
  return { ok: true, tailoringId: saved.id };
}

// A saved tailoring as the UI sees it. Stored JSON is re-validated on
// every read; a row that no longer validates becomes "invalid" and the
// page offers to generate again, like a stale comparison.
export type StoredTailoring =
  | {
      status: "ok";
      id: number;
      version: number;
      state: "draft" | "approved";
      resumeId: number;
      proposal: TailoringProposal;
      issues: CheckIssue[];
      model: string;
      pages: number | null;
      createdAt: Date;
    }
  | { status: "invalid"; id: number; version: number; createdAt: Date };

export async function getLatestTailoring(jobId: number): Promise<StoredTailoring | null> {
  const row = await getLatestTailoringRow(jobId);
  if (!row) return null;
  const proposal = tailoringProposalSchema.safeParse(row.proposal);
  const issues = checkIssueSchema.array().safeParse(row.issues);
  if (!proposal.success || !issues.success) {
    return { status: "invalid", id: row.id, version: row.version, createdAt: row.createdAt };
  }
  return {
    status: "ok",
    id: row.id,
    version: row.version,
    state: row.status,
    resumeId: row.resumeId,
    proposal: proposal.data,
    issues: issues.data,
    model: row.model,
    pages: row.pages,
    createdAt: row.createdAt,
  };
}
