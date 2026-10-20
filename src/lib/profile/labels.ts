import type { Experience, Proficiency, ProfileSource } from "@/lib/schemas/profile";

// Display text for the profile's stored values.

export const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  expert: "Expert",
  proficient: "Proficient",
  familiar: "Familiar",
  learning: "Learning",
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  professional: "Professional",
  personal: "Personal projects",
  coursework: "Coursework",
};

export const SOURCE_LABELS: Record<ProfileSource, string> = {
  resume: "From resume",
  added: "Added",
  gap: "From a comparison gap",
};
