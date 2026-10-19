import { z } from "zod";

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
