import { skillKey } from "@/lib/comparison-helpers";
import { mentions } from "@/lib/profile/context";
import type { SkillResolver } from "@/lib/skills/resolver";

// Aliases decide that you *have* a skill; they don't change what an
// applicant tracking system sees. Many match keywords literally, so if the
// listing says "Postgres" and your resume only says "PostgreSQL", the skill
// is matched but the keyword may still be missed. A wording note points
// that out. See docs/tailored-resumes.md, "Skill names and aliases".

export type WordingNote = {
  // The skill as the listing writes it.
  listingTerm: string;
  // How your resume writes the same skill.
  resumeTerm: string;
};

// `matchedSkills` are in the listing's wording (the comparison prompt asks
// for that). For each, if the resume doesn't use those words but does use
// another name for the same skill, that's a note.
export function wordingNotes(
  matchedSkills: readonly string[],
  resumeText: string,
  resolver: SkillResolver,
): WordingNote[] {
  const resume = resumeText.toLowerCase();
  const notes: WordingNote[] = [];
  const seen = new Set<string>();

  for (const listingTerm of matchedSkills) {
    const listingKey = skillKey(listingTerm);
    if (listingKey === "" || seen.has(listingKey) || mentions(resume, listingKey)) continue;

    const resumeTerm = resolver
      .termsFor(resolver.resolve(listingTerm).key)
      .find((term) => skillKey(term) !== listingKey && mentions(resume, skillKey(term)));
    if (resumeTerm) {
      seen.add(listingKey);
      notes.push({ listingTerm, resumeTerm });
    }
  }
  return notes;
}
