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
  // kept_yours: text you wrote yourself while reviewing. It's flagged,
  // never reverted: you're the source of truth for your own words.
  resolution: z.enum(["removed", "kept_original", "kept_yours"]),
});

export type CheckIssue = z.infer<typeof checkIssueSchema>;
export type IssueKind = CheckIssue["kinds"][number];

// ---- Your edits while reviewing (B1) and revision notes (A) ----
// See docs/tailored-resumes.md, "Editing and revising a draft".

const ID_PATTERNS = { entry: /^entry:\d+$/, bullet: /^bullet:\d+$/ } as const;
const profileId = (prefix: "entry" | "bullet") => z.string().regex(ID_PATTERNS[prefix]);
const direction = z.enum(["up", "down"]);

// One edit, applied on top of the checked proposal. Stored as a list and
// replayed in order; resetting an item drops the edits that touch it.
export const reviewEditSchema = z.discriminatedUnion("op", [
  // Your wording for the summary or a bullet.
  z.object({
    op: z.literal("text"),
    itemId: z.union([z.literal("summary"), profileId("bullet")]),
    text: z.string().trim().min(1, "The text can't be empty.").max(1500, "That's too long for a resume line."),
  }),
  z.object({ op: z.literal("remove_entry"), entryId: profileId("entry") }),
  z.object({ op: z.literal("move_entry"), entryId: profileId("entry"), direction }),
  z.object({ op: z.literal("remove_bullet"), bulletId: profileId("bullet") }),
  z.object({ op: z.literal("move_bullet"), bulletId: profileId("bullet"), direction }),
]);

export type ReviewEdit = z.infer<typeof reviewEditSchema>;
export const reviewEditsSchema = z.array(reviewEditSchema).max(300);

// Your accept/reject decision per change id.
export const decisionsSchema = z.record(z.string().max(200), z.enum(["accepted", "rejected"]));
export type Decisions = z.infer<typeof decisionsSchema>;

// What you ask a revision to do: a note on any change, and one for the
// draft as a whole.
export const revisionRequestSchema = z.object({
  notes: z
    .array(z.object({ changeId: z.string().max(200), note: z.string().trim().min(1).max(1000) }))
    .max(50),
  generalNote: z.string().trim().max(2000),
  // The page count from "Check length", if you checked: lets "keep it to
  // one page" be followed.
  pages: z.number().int().min(1).max(10).nullable(),
});

export type RevisionRequest = z.infer<typeof revisionRequestSchema>;

// What the page asks an edit to do: one edit, a reset of one item ("Reset"
// on a change or in the outline), or a reset of everything.
export type EditRequest = { edit: ReviewEdit } | { reset: string } | { resetAll: true };
