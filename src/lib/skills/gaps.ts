import type { ProfileSkill } from "@/lib/profile/types";
import { similarSkills, type SkillResolver } from "@/lib/skills/resolver";

// How each comparison gap relates to your profile, for the compare page.
// The comparison scores the resume as written; this only labels the gaps,
// it never changes the score.

export type GapStatus =
  // In your profile (by name or alias), just not on this resume.
  | "in_profile"
  // In your profile at the Learning level.
  | "learning"
  // Not in your profile: offer "I have this".
  | "absent";

export type GapView = {
  name: string;
  status: GapStatus;
  // For "absent" gaps: profile skills with similar names, for "Is this the
  // same as …?".
  suggestions: { id: number; name: string }[];
};

export function describeGaps(
  missingSkills: readonly string[],
  profileSkills: readonly ProfileSkill[],
  resolver: SkillResolver,
): GapView[] {
  const byKey = new Map(profileSkills.map((skill) => [resolver.resolve(skill.name).key, skill]));

  return missingSkills.map((name) => {
    const match = byKey.get(resolver.resolve(name).key);
    if (match) {
      return { name, status: match.proficiency === "learning" ? "learning" : "in_profile", suggestions: [] };
    }
    return {
      name,
      status: "absent",
      suggestions: similarSkills(name, profileSkills).map((skill) => ({ id: skill.id, name: skill.name })),
    };
  });
}
