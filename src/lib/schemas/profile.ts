import { z } from "zod";
import { idSchema, optionalText } from "@/lib/schemas/form";

// Value sets for the profile (see docs/tailored-resumes.md, "The profile").
// The database columns use these as text enums, and the forms in the
// Profile page validate against them.

// Highest to lowest. Learning skills never appear on a resume; a cover
// letter may mention them as learning.
export const PROFICIENCY_LEVELS = ["expert", "proficient", "familiar", "learning"] as const;
export const proficiencySchema = z.enum(PROFICIENCY_LEVELS);
export type Proficiency = z.infer<typeof proficiencySchema>;

// Personal-project skills can be listed, but never implied as
// professional (woven into a job's bullets).
export const EXPERIENCE_KINDS = ["professional", "personal", "coursework"] as const;
export const experienceSchema = z.enum(EXPERIENCE_KINDS);
export type Experience = z.infer<typeof experienceSchema>;

// Where a profile item came from: imported from the resume's .tex, typed
// on the Profile page, or confirmed from a comparison gap.
export const PROFILE_SOURCES = ["resume", "added", "gap"] as const;
export const profileSourceSchema = z.enum(PROFILE_SOURCES);
export type ProfileSource = z.infer<typeof profileSourceSchema>;

// Form input for the Profile page. Like the saved-job form, edits are full
// replaces: every field is submitted, and a blank optional field clears it.

// A <select> submits "" for "not set".
const optionalChoice = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

// Aliases are typed as one comma-separated field: "Postgres, PG".
const aliasList = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((alias) => alias.trim())
          .filter((alias) => alias !== "")
      : value,
  z.array(z.string().max(100, "Each alias must be 100 characters or fewer")).max(20, "At most 20 aliases"),
);

const skillFields = {
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
  category: optionalText(60, "Category must be 60 characters or fewer"),
  proficiency: optionalChoice(proficiencySchema),
  experience: optionalChoice(experienceSchema),
  note: optionalText(500, "Note must be 500 characters or fewer"),
  aliases: aliasList,
};

export const createSkillSchema = z.object(skillFields);
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export const updateSkillSchema = z.object({ id: idSchema, ...skillFields });
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

// Dates, subtitle, and detail are free text exactly as the template prints
// them; blank is stored as "" (the template prints nothing).
const entryFields = {
  section: z.string().trim().min(1, "Section is required").max(80, "Section must be 80 characters or fewer"),
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  dates: z.string().trim().max(80, "Dates must be 80 characters or fewer"),
  subtitle: z.string().trim().max(200, "Subtitle must be 200 characters or fewer"),
  detail: z.string().trim().max(200, "Detail must be 200 characters or fewer"),
};

export const createEntrySchema = z.object(entryFields);
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export const updateEntrySchema = z.object({ id: idSchema, ...entryFields });
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

const bulletText = z.string().trim().min(1, "Bullet text is required").max(500, "Bullets must be 500 characters or fewer");
export const createBulletSchema = z.object({ entryId: idSchema, text: bulletText });
export type CreateBulletInput = z.infer<typeof createBulletSchema>;
export const updateBulletSchema = z.object({ id: idSchema, text: bulletText });
export type UpdateBulletInput = z.infer<typeof updateBulletSchema>;

const highlightText = z.string().trim().min(1, "Highlight text is required").max(300, "Highlights must be 300 characters or fewer");
export const createHighlightSchema = z.object({ text: highlightText });
export type CreateHighlightInput = z.infer<typeof createHighlightSchema>;
export const updateHighlightSchema = z.object({ id: idSchema, text: highlightText });
export type UpdateHighlightInput = z.infer<typeof updateHighlightSchema>;

export const profileItemIdSchema = z.object({ id: idSchema });

// "I have this" on a comparison gap (see docs/tailored-resumes.md,
// "Comparison gaps"). A discriminated union on `mode`: each choice
// validates exactly the fields it uses. jobId is the job whose comparison
// showed the gap; it's recorded as the item's source.
const gapName = z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or fewer");
// The skills ticked in the dialog: a gap phrase often names several
// ("cloud infrastructure (AWS, Azure, Google Cloud)"), and you may have
// only some of them. Sent as repeated `names` fields.
const gapNames = z.array(gapName).min(1, "Pick at least one skill").max(12, "Pick 12 skills or fewer");

export const confirmGapSchema = z.discriminatedUnion("mode", [
  // "Yes, it's the same as <skill>": the gap's name becomes an alias.
  z.object({ mode: z.literal("alias"), jobId: idSchema, name: gapName, skillId: idSchema }),
  // "Add them as skills": every ticked name, with the same details.
  z.object({
    mode: z.literal("skill"),
    jobId: idSchema,
    names: gapNames,
    category: skillFields.category,
    proficiency: skillFields.proficiency,
    experience: skillFields.experience,
    note: skillFields.note,
  }),
  // "No, but I'm learning these".
  z.object({ mode: z.literal("learning"), jobId: idSchema, names: gapNames, category: skillFields.category }),
  // "Add it as a highlight", for gaps that aren't skills ("5+ years of experience").
  z.object({ mode: z.literal("highlight"), jobId: idSchema, text: highlightText }),
]);

export type ConfirmGapInput = z.infer<typeof confirmGapSchema>;
