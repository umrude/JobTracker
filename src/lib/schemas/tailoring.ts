import { z } from "zod";

// What the model proposes for a tailored resume (Step 5b sends this as the
// structured-output schema). Everything refers to profile items by id
// ("skill:12", "entry:7", "bullet:40", from lib/profile/items.ts); the
// only free text is the summary and reworded bullets, and the honesty
// checker (lib/tailoring/check.ts) verifies both before you see anything.
//
// Sent to the API as JSON Schema, so no transforms here (see the note in
// lib/schemas/comparison.ts).

export const tailoringProposalSchema = z.object({
  summary: z
    .object({
      text: z.string().describe("The rewritten summary, using only facts from the profile."),
      sourceIds: z
        .array(z.string())
        .describe("Ids of the highlights and bullets the summary draws on."),
    })
    .nullable()
    .describe("Null if the resume has no summary section."),
  skills: z
    .array(
      z.object({
        categoryId: z.string().describe("A skill category id from the resume, e.g. \"s1\"."),
        skillIds: z.array(z.string()).describe("Profile skill ids, most relevant first."),
      }),
    )
    .describe("Skill categories in order, each with its skills in order."),
  sections: z
    .array(
      z.object({
        section: z.string().describe("The section title, e.g. \"Experience\"."),
        isNew: z.boolean().describe("True only for a section the resume doesn't have yet."),
        afterSection: z
          .string()
          .nullable()
          .describe("For a new section: the existing section it follows. Null to put it last."),
        entries: z.array(
          z.object({
            entryId: z.string().describe("A profile entry id."),
            bullets: z.array(
              z.object({
                bulletId: z.string().describe("A profile bullet id belonging to this entry."),
                text: z.string().describe("The bullet's text, as is or lightly reworded."),
              }),
            ),
          }),
        ),
      }),
    )
    .describe("Sections whose entries change, each with its entries in order."),
  trimOrder: z
    .array(z.string())
    .describe("Bullet ids in the proposal, least important first, to remove if it runs past one page."),
  rationale: z.string().describe("Two or three sentences on the main choices, for the person reviewing."),
});

export type TailoringProposal = z.infer<typeof tailoringProposalSchema>;

// What the honesty checker found and did about it (lib/tailoring/check.ts).
// Stored with the proposal and shown as flags in review.
export const ISSUE_KINDS = [
  "unknown_id",
  "learning_skill",
  "unknown_category",
  "moved_bullet",
  "wrong_section",
  "new_number",
  "new_skill",
  "too_long",
  "empty_text",
  "unbacked_skill",
  "empty_entry",
  "unknown_section",
] as const;

export const checkIssueSchema = z.object({
  // The proposal item this is about, e.g. "bullet:40", "summary".
  itemId: z.string(),
  kinds: z.array(z.enum(ISSUE_KINDS)),
  message: z.string(),
  resolution: z.enum(["removed", "kept_original"]),
});

export type CheckIssue = z.infer<typeof checkIssueSchema>;
export type IssueKind = CheckIssue["kinds"][number];
