import type { ProfileSkill } from "@/lib/profile/types";
import { similarSkills, type SkillResolver } from "@/lib/skills/resolver";
import { skillCandidates, type SkillCandidate } from "@/lib/skills/candidates";

// How each comparison gap relates to your profile, for the compare page.
// The comparison scores the resume as written; this only labels the gaps,
// it never changes the score.

export type GapStatus =
  // In your profile (by name or alias), just not on this resume.
  | "in_profile"
  // In your profile at the Learning level.
  | "learning"
  // Some of the skills in the phrase are in your profile ("AWS, Azure" of
  // "cloud infrastructure (AWS, Azure, Google Cloud)"), but not the phrase
  // as a whole: say which, and still offer "I have this" for the rest.
  | "partial"
  // Not in your profile: offer "I have this".
  | "absent";

export type GapView = {
  name: string;
  status: GapStatus;
  // For "absent" gaps: profile skills with similar names, for "Is this the
  // same as …?".
  suggestions: { id: number; name: string }[];
  // For "absent" and "partial" gaps: the skills inside the phrase, to tick
  // in "I have this" (lib/skills/candidates.ts).
  candidates: SkillCandidate[];
};

export function describeGaps(
  missingSkills: readonly string[],
  profileSkills: readonly ProfileSkill[],
  resolver: SkillResolver,
): GapView[] {
  const byKey = new Map(profileSkills.map((skill) => [resolver.resolve(skill.name).key, skill]));
  const profileKeys = new Set(byKey.keys());

  return missingSkills.map((name): GapView => {
    const match = byKey.get(resolver.resolve(name).key);
    if (match) {
      return { name, status: match.proficiency === "learning" ? "learning" : "in_profile", suggestions: [], candidates: [] };
    }
    const candidates = skillCandidates(name, resolver, profileKeys);
    // "In profile" is only for the phrase as a whole. Having every skill
    // inside it ("Leaflet" of "Leaflet maps") is still partial: the phrase
    // may mean more, so it stays a choice of its own.
    if (candidates.length > 0 && candidates.every((c) => c.inProfile)) {
      candidates.push({ name, inProfile: false });
    }
    return {
      name,
      status: candidates.some((c) => c.inProfile) ? "partial" : "absent",
      suggestions: similarSkills(name, profileSkills).map((skill) => ({ id: skill.id, name: skill.name })),
      candidates,
    };
  });
}
