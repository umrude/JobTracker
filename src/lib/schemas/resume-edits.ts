import { z } from "zod";

// The changes applyResumeEdits() can make to a LaTeX resume, all in plain
// text. Each part is optional; anything not mentioned stays as it was.
//
// This only describes the *shape* of an edit. Whether an edit is honest
// (no new skills, no invented numbers) is checked separately, before the
// edit gets here (Step 5 in docs/tailored-resumes.md).

const text = z.string().trim().min(1);

export const resumeEditsSchema = z.object({
  // Replaces the summary paragraph.
  summary: text.optional(),
  // Replaces the whole skills block, in this order. Categories not listed
  // are removed. Category ids come from parseResumeLatex().
  skills: z
    .array(z.object({ categoryId: z.string(), items: z.array(text).min(1) }))
    .min(1)
    .optional(),
  // For each listed entry, replaces its bullets with these, in order. An
  // entry needs at least one bullet: an empty list doesn't compile.
  entries: z
    .array(z.object({ entryId: z.string(), bullets: z.array(text).min(1) }))
    .optional(),
});

export type ResumeEdits = z.infer<typeof resumeEditsSchema>;
