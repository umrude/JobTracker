import { z } from "zod";

// The changes applyResumeEdits() can make to a LaTeX resume, all in plain
// text. Each part is optional; anything not mentioned stays as it was.
//
// This only describes the *shape* of an edit. Whether an edit is honest
// (nothing outside the profile, no invented numbers) is checked separately,
// before the edit gets here (lib/tailoring/check.ts).

const text = z.string().trim().min(1);

// One entry within a section edit: an existing .tex entry (by parser id,
// with new bullets, or `bullets` omitted to keep them as they are), or a
// new entry from the profile, written in the template's format.
export const entryEditSchema = z.union([
  z.object({ entryId: z.string(), bullets: z.array(text).optional() }),
  z.object({
    heading: z.tuple([z.string(), z.string(), z.string(), z.string()]),
    // Empty for an entry without a list (like an education entry).
    bullets: z.array(text),
  }),
]);

export type EntryEdit = z.infer<typeof entryEditSchema>;

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
  // Which entries each section holds, in order: an existing section by
  // title (entries not listed are removed), or a new section placed after
  // an existing one (`afterSection: null` puts it last).
  sections: z
    .array(
      z.union([
        z.object({ title: z.string(), entries: z.array(entryEditSchema).min(1) }),
        z.object({
          newTitle: z.string().trim().min(1),
          afterSection: z.string().nullable(),
          entries: z.array(entryEditSchema).min(1),
        }),
      ]),
    )
    .optional(),
});

export type ResumeEdits = z.infer<typeof resumeEditsSchema>;
