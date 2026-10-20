import "server-only";
import { getMode } from "@/server/mode";
import { getActiveResume, getResume } from "@/server/db/resumes";
import { getJobForComparison } from "@/server/db/comparisons";
import { loadProfile } from "@/server/db/profile";
import { getLatestApprovedTailoringRow } from "@/server/db/tailored-resumes";
import { createCoverLetter, listCoverLetterRows, saveCoverLetterText } from "@/server/db/cover-letters";
import { getLlmClient } from "@/server/llm/client";
import { writeCoverLetter } from "@/server/llm/cover-letter";
import { getDemoCoverLetter } from "@/server/llm/cover-letter-demo";
import { DEMO_MODEL } from "@/server/llm/compare-demo";
import { applyResumeEdits, parseResumeLatex } from "@/lib/latex/resume";
import { checkCoverLetter } from "@/lib/cover-letter/check";
import { headerName, letterText, resumePlainText } from "@/lib/cover-letter/sources";
import type { LlmError } from "@/lib/llm-result";
import { resumeEditsSchema } from "@/lib/schemas/resume-edits";
import { letterWarningSchema, type CoverLength, type CoverTone, type LetterWarning } from "@/lib/schemas/cover-letter";
import { createSkillResolver } from "@/lib/skills/resolver";

// Cover letters: writing, listing, and editing. See docs/cover-letters.md.

type LetterSource = {
  resumeId: number;
  tailoringId: number | null;
  resumeText: string;
  name: string | null;
};

// What a letter is written from: the newest approved tailored resume for
// this job, so the letter stresses the same experience; otherwise the
// active resume. The tailored resume is rebuilt from its approved edits,
// exactly as its PDF is.
async function letterSource(jobId: number): Promise<LetterSource | null> {
  const approved = await getLatestApprovedTailoringRow(jobId);
  if (approved) {
    const edits = resumeEditsSchema.safeParse(approved.approved);
    const resume = await getResume(approved.resumeId);
    if (edits.success && resume?.latexSource) {
      const applied = applyResumeEdits(resume.latexSource, edits.data);
      const parsed = applied.ok ? parseResumeLatex(applied.tex) : null;
      if (applied.ok && parsed?.ok) {
        return {
          resumeId: resume.id,
          tailoringId: approved.id,
          resumeText: resumePlainText(parsed.resume),
          name: headerName(applied.tex),
        };
      }
    }
  }

  const active = await getActiveResume();
  if (!active) return null;
  const parsed = active.latexSource ? parseResumeLatex(active.latexSource) : null;
  return {
    resumeId: active.id,
    tailoringId: null,
    resumeText: parsed?.ok ? resumePlainText(parsed.resume) : active.text,
    name: active.latexSource ? headerName(active.latexSource) : null,
  };
}

export type GenerateCoverLetterResult =
  | { ok: true; version: number }
  | { ok: false; error: LlmError | { kind: "job_not_found" | "no_listing_text" | "no_resume"; message: string } };

// Writes a new version and saves it. Demo mode uses canned letters, still
// checked. This writes, so its Server Action calls assertWritable() first.
export async function generateCoverLetter(
  jobId: number,
  options: { tone: CoverTone; length: CoverLength },
): Promise<GenerateCoverLetterResult> {
  const job = await getJobForComparison(jobId);
  if (!job) return { ok: false, error: { kind: "job_not_found", message: "This job no longer exists." } };
  if (!job.listingText) {
    return { ok: false, error: { kind: "no_listing_text", message: "This job has no listing text yet. Add it on the Saved jobs page first." } };
  }
  const source = await letterSource(job.id);
  if (!source) return { ok: false, error: { kind: "no_resume", message: "Upload a resume first." } };

  const profile = await loadProfile();
  const resolver = createSkillResolver(profile.skills);
  const input = {
    company: job.company,
    title: job.title,
    listing: job.listingText,
    resumeText: source.resumeText,
    profile,
    resolver,
    ...options,
  };

  let written: { output: Parameters<typeof letterText>[0]; warnings: LetterWarning[]; model: string };
  if ((await getMode()) === "demo") {
    const output = getDemoCoverLetter(job.url);
    written = { output, warnings: checkCoverLetter(output, input), model: DEMO_MODEL };
  } else {
    const client = getLlmClient();
    if (!client.ok) return client;
    const result = await writeCoverLetter(input, client.data);
    if (!result.ok) return result;
    written = result.data;
  }

  const saved = await createCoverLetter({
    jobId: job.id,
    tailoringId: source.tailoringId,
    resumeId: source.resumeId,
    ...options,
    text: letterText(written.output, source.name),
    warnings: written.warnings,
    model: written.model,
  });
  return { ok: true, version: saved.version };
}

export type StoredCoverLetter = {
  id: number;
  version: number;
  tone: CoverTone;
  length: CoverLength;
  text: string;
  edited: boolean;
  warnings: LetterWarning[];
  basedOnTailoring: boolean;
  model: string;
  createdAt: Date;
};

// Every version for a job, newest first. Warnings are re-validated on read;
// unreadable ones are dropped rather than breaking the page.
export async function listCoverLetters(jobId: number): Promise<StoredCoverLetter[]> {
  const rows = await listCoverLetterRows(jobId);
  return rows.map((row) => {
    const warnings = letterWarningSchema.array().safeParse(row.warnings);
    return {
      id: row.id,
      version: row.version,
      tone: row.tone,
      length: row.length,
      text: row.text,
      edited: row.text !== row.generatedText,
      warnings: warnings.success ? warnings.data : [],
      basedOnTailoring: row.tailoringId !== null,
      model: row.model,
      createdAt: row.createdAt,
    };
  });
}

export async function updateCoverLetter(id: number, text: string): Promise<boolean> {
  return saveCoverLetterText(id, text);
}
