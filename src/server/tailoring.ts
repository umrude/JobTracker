import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume, getResume } from "@/server/db/resumes";
import { getJobForComparison } from "@/server/db/comparisons";
import { loadProfile } from "@/server/db/profile";
import { createTailoringDraft, getLatestTailoringRow, getTailoringRow, saveApproval, saveReviewState } from "@/server/db/tailored-resumes";
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
import { buildApproval, mergedSections, trimApproval, type Approval } from "@/lib/tailoring/approve";
import {
  applyEdit,
  applyEdits,
  buildOutline,
  carryDecisions,
  checkYourText,
  withoutEditsFor,
  wordedItemOf,
  type Outline,
} from "@/lib/tailoring/edits";
import { entryHeadingText } from "@/lib/profile/items";
import { currentAsProposal, listChanges, type ReviewChange } from "@/lib/tailoring/changes";
import type { LlmError } from "@/lib/llm-result";
import { createSkillResolver } from "@/lib/skills/resolver";
import {
  checkIssueSchema,
  decisionsSchema,
  reviewEditsSchema,
  tailoringProposalSchema,
  type CheckIssue,
  type Decisions,
  type EditRequest,
  type ReviewEdit,
  type RevisionRequest,
  type TailoringProposal,
} from "@/lib/schemas/tailoring";
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
      // Your edits while reviewing, and your decisions (drafts only).
      userEdits: ReviewEdit[];
      decisions: Decisions;
      // For a revision: the draft it revised, and your overall note.
      revisedFromId: number | null;
      revisionNote: string | null;
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
    // Old or odd stored edits mean "none", not a broken page.
    userEdits: reviewEditsSchema.safeParse(row.userEdits).data ?? [],
    decisions: decisionsSchema.safeParse(row.decisions ?? {}).data ?? {},
    revisedFromId: row.revisedFromId,
    revisionNote: row.revisionNote,
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
  // For a draft: the whole proposed resume (for moving and removing
  // entries and bullets), flags on your own wording, and your decisions.
  outline: Outline | null;
  yourIssues: CheckIssue[];
  decisions: Decisions;
  // For an approved version: entries that can be removed to fit one page
  // (not one that's the only entry in its section).
  trimEntries: { entryId: string; heading: string }[];
  // For an approved version: bullets suggested for removal if it runs
  // past one page, least important first.
  trimSuggestions: { bulletId: string; text: string }[];
  pages: number | null;
};

export async function getTailoringReview(jobId: number): Promise<TailoringReview> {
  const latest = await getLatestTailoring(jobId);
  const review: TailoringReview = {
    latest,
    changes: null,
    reviewError: null,
    outline: null,
    yourIssues: [],
    decisions: {},
    trimEntries: [],
    trimSuggestions: [],
    pages: null,
  };
  if (!latest || latest.status !== "ok") return review;

  const context = await loadTailoringContext(latest.resumeId);
  if (!context.ok) return { ...review, reviewError: context.message };

  if (latest.state === "draft") {
    const draft = draftState(context, latest.proposal, latest.userEdits);
    if (!draft.ok) return { ...review, reviewError: draft.message };
    return {
      ...review,
      changes: draft.changes,
      outline: buildOutline(draft.effective, draft.original, latest.userEdits, context.profile),
      yourIssues: checkYourText(latest.userEdits, context.profile, context.resolver),
      decisions: latest.decisions,
    };
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
  const current = currentAsProposal(context.profile, context.tex, context.resolver);
  const trimEntries =
    final.success && current.ok
      ? mergedSections(current.proposal, final.data)
          .filter((section) => section.entries.length > 1)
          .flatMap((section) =>
            section.entries.map((entry) => ({
              entryId: entry.entryId,
              heading: `${section.section}: ${headingFor(context.profile, entry.entryId)}`,
            })),
          )
      : [];
  return { ...review, trimSuggestions, trimEntries, pages };
}

function headingFor(profile: Profile, entryId: string): string {
  const entry = profile.entries.find((e) => `entry:${e.id}` === entryId);
  return entry ? entryHeadingText(entry) : entryId;
}

type ReadyContext = Extract<TailoringContext, { ok: true }>;

// A draft as you see it: your current resume (in proposal form), the
// proposal with your edits applied, and the changes between them.
function draftState(
  context: ReadyContext,
  proposal: TailoringProposal,
  userEdits: readonly ReviewEdit[],
): { ok: true; original: TailoringProposal; effective: TailoringProposal; changes: ReviewChange[] } | { ok: false; message: string } {
  const current = currentAsProposal(context.profile, context.tex, context.resolver);
  if (!current.ok) return current;
  const effective = applyEdits(proposal, current.proposal, userEdits);
  return {
    ok: true,
    original: current.proposal,
    effective,
    changes: listChanges(current.proposal, effective, context.profile, context.tex),
  };
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
  // Your edits are part of what you approve.
  const userEdits = reviewEditsSchema.safeParse(row.userEdits).data ?? [];
  const draft = draftState(context, proposed.data, userEdits);
  if (!draft.ok) return { ok: false, message: draft.message };
  const built = buildApproval({ ...context, proposed: draft.effective, accepted });
  if (!built.ok) return { ok: false, message: built.message };

  return savePdf(tailoringId, built.approval);
}

// Removes the given bullets and entries from an approved resume to help it
// fit one page.
export async function trimTailoring(tailoringId: number, bulletIds: string[], entryIds: string[] = []): Promise<ApprovalResult> {
  const row = await getTailoringRow(tailoringId);
  if (!row || row.status !== "approved") return { ok: false, message: "Only an approved version can be trimmed." };
  const final = tailoringProposalSchema.safeParse(row.snapshot);
  if (!final.success) return { ok: false, message: "This version is in an older format. Generate a new one." };

  const context = await loadTailoringContext(row.resumeId);
  if (!context.ok) return { ok: false, message: context.message };
  const trimmed = trimApproval({ ...context, final: final.data, removeBulletIds: bulletIds, removeEntryIds: entryIds });
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

// ---- Editing a draft yourself (docs/tailored-resumes.md) ----

export type EditResult = { ok: true } | { ok: false; message: string };

// Loads a draft you can still edit, with its context and your stored edits.
async function editableDraft(tailoringId: number) {
  const row = await getTailoringRow(tailoringId);
  if (!row) return { ok: false as const, message: "This tailored resume no longer exists." };
  if (row.status !== "draft") return { ok: false as const, message: "This version is approved. Generate or revise to change it." };
  const proposal = tailoringProposalSchema.safeParse(row.proposal);
  if (!proposal.success) return { ok: false as const, message: "This proposal is in an older format. Generate a new one." };
  const context = await loadTailoringContext(row.resumeId);
  if (!context.ok) return context;
  const userEdits = reviewEditsSchema.safeParse(row.userEdits).data ?? [];
  const draft = draftState(context, proposal.data, userEdits);
  if (!draft.ok) return draft;
  return {
    ok: true as const,
    row,
    context,
    proposal: proposal.data,
    userEdits,
    original: draft.original,
    effective: draft.effective,
    changes: draft.changes,
  };
}

// Applies one edit (or resets one item, or all of them) and saves it with
// your decisions. A change your edit created or changed counts as accepted
// (you made it); a reset leaves the proposal's version undecided again.
// `decisions` is what the page holds right now, so nothing you decided
// since the last save is lost.
export async function editTailoring(tailoringId: number, request: EditRequest, decisions: Decisions): Promise<EditResult> {
  const draft = await editableDraft(tailoringId);
  if (!draft.ok) return draft;

  let userEdits: ReviewEdit[];
  if ("edit" in request) {
    const outcome = applyEdit(draft.effective, draft.original, request.edit);
    if (!outcome.ok) return outcome;
    const edit = request.edit;
    // A new wording of an item replaces your previous one.
    userEdits = [
      ...draft.userEdits.filter((e) => !(edit.op === "text" && e.op === "text" && e.itemId === edit.itemId)),
      edit,
    ];
  } else if ("reset" in request) {
    userEdits = withoutEditsFor(draft.userEdits, request.reset);
  } else {
    userEdits = [];
  }

  const after = draftState(draft.context, draft.proposal, userEdits);
  if (!after.ok) return after;
  const carried = carryDecisions(draft.changes, after.changes, decisions, "edit" in request ? "accepted" : undefined);
  const saved = await saveReviewState(tailoringId, { userEdits, decisions: carried });
  return saved ? { ok: true } : { ok: false, message: "This version is approved. Generate or revise to change it." };
}

export type LengthResult = { ok: true; pages: number } | { ok: false; message: string };

// Builds the PDF for the changes you've accepted so far, without saving
// anything, to see whether it fits one page before you approve. In the
// read-only public demo there's no TeX engine, so only pre-built PDFs can
// be "checked"; anything else says so.
export async function previewTailoringLength(tailoringId: number, accepted: string[]): Promise<LengthResult> {
  const draft = await editableDraft(tailoringId);
  if (!draft.ok) return draft;
  const known = new Set(draft.changes.map((c) => c.id));
  const built = buildApproval({ ...draft.context, proposed: draft.effective, accepted: accepted.filter((id) => known.has(id)) });
  if (!built.ok) return built;
  const pdf = await renderPdf(built.approval.tex);
  if (!pdf.ok) {
    return { ok: false, message: (await getMode()) === "demo" ? "The demo can't build new PDFs; it only has pre-built ones." : pdf.error.message };
  }
  return { ok: true, pages: pdf.pages };
}

// ---- Revising with notes (docs/tailored-resumes.md) ----

export type ReviseResult = { ok: true; tailoringId: number } | { ok: false; message: string };

// Asks the model for a new version of the draft that follows your notes,
// and saves it as the next draft (the old one stays in the history). The
// new proposal goes through the same honesty checker. Carried over:
// - your own wording, except on items a note asks to change;
// - your decisions, for changes that still say the same thing (anything
//   new or different is left for you to review).
//
// This writes, so the action that calls it must call assertWritable().
export async function reviseTailoring(tailoringId: number, request: RevisionRequest, decisions: Decisions): Promise<ReviseResult> {
  if (request.notes.length === 0 && request.generalNote === "") {
    return { ok: false, message: "Write a note on a change or on the whole draft first." };
  }
  const draft = await editableDraft(tailoringId);
  if (!draft.ok) return draft;
  const job = await getJobForComparison(draft.row.jobId);
  if (!job?.listingText) return { ok: false, message: "This job has no listing text any more." };

  const changeById = new Map(draft.changes.map((c) => [c.id, c]));
  const notes = request.notes.flatMap((n) => {
    const change = changeById.get(n.changeId);
    return change ? [{ label: change.label, now: change.after, note: n.note, changeId: n.changeId }] : [];
  });
  // Your wording on an item a note is about gives way to the revision.
  const notedItems = new Set(notes.flatMap((n) => wordedItemOf(n.changeId) ?? []));
  const yourWording = draft.userEdits.flatMap((e) => (e.op === "text" ? [{ itemId: e.itemId, text: e.text }] : []));
  const keptWording = draft.userEdits.filter((e) => e.op === "text" && !notedItems.has(e.itemId));

  let proposal: TailoringProposal;
  let issues: CheckIssue[];
  let model: string;
  if ((await getMode()) === "demo") {
    // Demo mode can't read notes (no model). It shows how a revision
    // arrives: a new version with your edits in it, to review again.
    proposal = {
      ...draft.effective,
      rationale: "Demo mode can't read your notes, since it never calls the model. In the live app, this version would follow them.",
    };
    issues = [];
    model = DEMO_MODEL;
  } else {
    const client = getLlmClient();
    if (!client.ok) return { ok: false, message: client.error.message };
    const latest = await getLatestComparison(job.id);
    const comparison =
      latest?.status === "ok" ? { matchedSkills: latest.comparison.matchedSkills, missingSkills: latest.comparison.missingSkills } : null;
    const result = await tailorResume(
      {
        listing: job.listingText,
        context: draft.context,
        comparison,
        revision: {
          current: draft.effective,
          decisions: draft.changes.flatMap((c) => (decisions[c.id] ? [{ label: c.label, decision: decisions[c.id] }] : [])),
          notes,
          generalNote: request.generalNote,
          pages: request.pages,
          yourWording,
        },
      },
      client.data,
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    ({ proposal, issues, model } = result.data);
  }

  const after = draftState(draft.context, proposal, keptWording);
  const carried = after.ok ? carryDecisions(draft.changes, after.changes, decisions, undefined) : {};
  const saved = await createTailoringDraft({
    jobId: draft.row.jobId,
    resumeId: draft.row.resumeId,
    proposal,
    issues,
    model,
    revisedFromId: tailoringId,
    revisionNote: request.generalNote || null,
    decisions: carried,
    userEdits: keptWording,
  });
  return { ok: true, tailoringId: saved.id };
}
