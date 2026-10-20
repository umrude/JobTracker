import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume, getResume } from "@/server/db/resumes";
import { getJobForComparison } from "@/server/db/comparisons";
import { loadProfile } from "@/server/db/profile";
import { createTailoringDraft, getLatestTailoringRow, getTailoringRow, saveApproval } from "@/server/db/tailored-resumes";
import { renderLatexPdf } from "@/server/latex/render";
import type { CompileResult } from "@/server/latex/tectonic";
import { getLatestComparison } from "@/server/comparisons";
import { getLlmClient } from "@/server/llm/client";
import { tailorResume } from "@/server/llm/tailor";
import { getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { DEMO_MODEL } from "@/server/llm/compare-demo";
import { applyResumeEdits, parseResumeLatex, type ParsedResumeLatex } from "@/lib/latex/resume";
import type { Profile } from "@/lib/profile/types";
import { resumeEditsSchema } from "@/lib/schemas/resume-edits";
import type { SkillResolver } from "@/lib/skills/resolver";
import { buildApproval, trimApproval, type Approval } from "@/lib/tailoring/approve";
import { currentAsProposal, listChanges, type ReviewChange } from "@/lib/tailoring/changes";
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

// ---- Review, approval, and the PDF (Step 5c) ----

type TailoringContext =
  | { ok: false; message: string }
  | { ok: true; latexSource: string; tex: ParsedResumeLatex; profile: Profile; resolver: SkillResolver };

// Everything needed to review or approve a tailoring: the resume version
// it was made from (not necessarily the active one), its parsed .tex, and
// your current profile.
async function loadTailoringContext(resumeId: number): Promise<TailoringContext> {
  const resume = await getResume(resumeId);
  if (!resume?.latexSource) {
    return { ok: false, message: "The resume this was tailored from no longer has its .tex." };
  }
  const tex = parseResumeLatex(resume.latexSource);
  if (!tex.ok) return { ok: false, message: tex.message };
  const profile = await loadProfile();
  return {
    ok: true,
    latexSource: resume.latexSource,
    tex: tex.resume,
    profile,
    resolver: createSkillResolver(profile.skills),
  };
}

// See server/latex/render.ts for when this compiles or serves a pre-built PDF.
const renderPdf = (tex: string): Promise<CompileResult> => renderLatexPdf(tex);

export type TailoringReview = {
  latest: StoredTailoring | null;
  // For a draft: the changes to review, or why they can't be shown.
  changes: ReviewChange[] | null;
  reviewError: string | null;
  // For an approved version: bullets suggested for removal if it runs
  // past one page, least important first.
  trimSuggestions: { bulletId: string; text: string }[];
  pages: number | null;
};

export async function getTailoringReview(jobId: number): Promise<TailoringReview> {
  const latest = await getLatestTailoring(jobId);
  const review: TailoringReview = { latest, changes: null, reviewError: null, trimSuggestions: [], pages: null };
  if (!latest || latest.status !== "ok") return review;

  const context = await loadTailoringContext(latest.resumeId);
  if (!context.ok) return { ...review, reviewError: context.message };

  if (latest.state === "draft") {
    const current = currentAsProposal(context.profile, context.tex, context.resolver);
    if (!current.ok) return { ...review, reviewError: current.message };
    return { ...review, changes: listChanges(current.proposal, latest.proposal, context.profile, context.tex) };
  }

  // Approved: trim suggestions, and the page count (worked out here for
  // seeded rows, since the seed can't compile).
  const row = await getTailoringRow(latest.id);
  const final = tailoringProposalSchema.safeParse(row?.snapshot);
  const bulletText = new Map(context.profile.entries.flatMap((e) => e.bullets.map((b) => [`bullet:${b.id}`, b.text])));
  const trimSuggestions = final.success
    ? final.data.trimOrder.flatMap((bulletId) => {
        const text = bulletText.get(bulletId);
        return text ? [{ bulletId, text }] : [];
      })
    : [];
  let pages = latest.pages;
  if (pages === null) {
    const pdf = await renderTailoredPdf(latest.id);
    pages = pdf.ok ? pdf.pages : null;
  }
  return { ...review, trimSuggestions, pages };
}

export type ApprovalResult = { ok: true; pages: number | null; warning: string | null } | { ok: false; message: string };

// Saves the changes you accepted, builds the PDF, and records its page
// count. A PDF problem doesn't undo the approval: the edits are saved and
// the problem is reported.
export async function approveTailoring(tailoringId: number, accepted: string[]): Promise<ApprovalResult> {
  const row = await getTailoringRow(tailoringId);
  if (!row) return { ok: false, message: "This tailored resume no longer exists." };
  if (row.status !== "draft") {
    return { ok: false, message: "This version is already approved. Generate a new one to change it." };
  }
  const proposed = tailoringProposalSchema.safeParse(row.proposal);
  if (!proposed.success) return { ok: false, message: "This proposal is in an older format. Generate a new one." };

  const context = await loadTailoringContext(row.resumeId);
  if (!context.ok) return { ok: false, message: context.message };
  const built = buildApproval({ ...context, proposed: proposed.data, accepted });
  if (!built.ok) return { ok: false, message: built.message };

  return savePdf(tailoringId, built.approval);
}

// Removes the given bullets from an approved resume to help it fit one page.
export async function trimTailoring(tailoringId: number, bulletIds: string[]): Promise<ApprovalResult> {
  const row = await getTailoringRow(tailoringId);
  if (!row || row.status !== "approved") return { ok: false, message: "Only an approved version can be trimmed." };
  const final = tailoringProposalSchema.safeParse(row.snapshot);
  if (!final.success) return { ok: false, message: "This version is in an older format. Generate a new one." };

  const context = await loadTailoringContext(row.resumeId);
  if (!context.ok) return { ok: false, message: context.message };
  const trimmed = trimApproval({ ...context, final: final.data, removeBulletIds: bulletIds });
  if (!trimmed.ok) return { ok: false, message: trimmed.message };

  return savePdf(tailoringId, trimmed.approval);
}

async function savePdf(tailoringId: number, approval: Approval): Promise<ApprovalResult> {
  const pdf = await renderPdf(approval.tex);
  const pages = pdf.ok ? pdf.pages : null;
  const saved = await saveApproval(tailoringId, { edits: approval.edits, final: approval.final, pages });
  if (!saved) return { ok: false, message: "This tailored resume no longer exists." };
  return {
    ok: true,
    pages,
    warning: pdf.ok ? null : `Your changes are saved, but the PDF couldn't be built: ${pdf.error.message}`,
  };
}

// The approved PDF, rebuilt from the stored LaTeX edits and the resume
// version's .tex (never the current profile), so it's always exactly what
// you approved.
export async function renderTailoredPdf(
  tailoringId: number,
): Promise<{ ok: true; pdf: Uint8Array; pages: number; version: number } | Extract<CompileResult, { ok: false }>> {
  const row = await getTailoringRow(tailoringId);
  if (!row || row.status !== "approved") {
    return { ok: false, error: { kind: "latex_error", message: "This tailored resume isn't approved yet." } };
  }
  const edits = resumeEditsSchema.safeParse(row.approved);
  const resume = await getResume(row.resumeId);
  if (!edits.success || !resume?.latexSource) {
    return { ok: false, error: { kind: "latex_error", message: "This version can't be rebuilt. Generate a new one." } };
  }
  const applied = applyResumeEdits(resume.latexSource, edits.data);
  if (!applied.ok) return { ok: false, error: { kind: "latex_error", message: applied.message } };
  const pdf = await renderPdf(applied.tex);
  return pdf.ok ? { ...pdf, version: row.version } : pdf;
}
