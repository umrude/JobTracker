import { skillKey } from "@/lib/comparison-helpers";
import type { SkillResolver } from "@/lib/skills/resolver";
import { skillKeysIn } from "@/lib/tailoring/text-checks";

// The skills inside a comparison gap's phrase, for "I have this": a
// listing says "Expertise in managing cloud infrastructure (AWS, Azure,
// Google Cloud)", and you have AWS and Azure but not Google Cloud. So the
// dialog offers each skill on its own, to tick. Pure: tested on its own.
//
// Two sources, merged:
// - known skills the resolver finds in the phrase (built-in aliases and
//   yours), named canonically: "AWS", "Microsoft Azure";
// - the phrase's own structure, for skills the resolver doesn't know:
//   leading filler dropped ("Expertise in managing"), lists in parentheses
//   split, and "and", "using", "including" treated as separators.
// A phrase with no skill-like part ("5+ years in increasingly senior
// roles") gives nothing, and the dialog falls back to the whole phrase.

// Words that introduce a skill rather than name one.
const LEADING_FILLER =
  /^(?:(?:solid|strong|practical|in-depth|deep|proven|hands-on|general|working|good|excellent|demonstrated|advanced|basic)\s+)*(?:(?:general\s+)?(?:expertise|experience|proficiency|knowledge|familiarity|understanding|skills?|background|comfort)\s+)(?:(?:in|with|of|across|using|on)\s+)?(?:(?:managing|building|designing|developing|using|working with|maintaining|administering|configuring|writing)(?:\s+and\s+(?:managing|configuring|maintaining|building|deploying))?\s+)?/i;

// A phrase that starts with what you'd do with the skill: "Maintaining and
// administering legacy systems", "Scripting in Python".
const LEADING_VERBS =
  /^(?:(?:maintaining|administering|managing|building|designing|developing|configuring|deploying|supporting|writing|scripting|programming|coding)(?:\s+(?:and|or)\s+)?)+(?:\s*(?:in|with|for)\s+)?/i;

// Asides in a listing that aren't skills: "(asset)", "(preferred)".
const NOT_SKILLS = /^(?:asset|preferred|required|a plus|plus|bonus|nice to have|optional|equivalent)$/i;

// What splits a phrase into separate skills.
const SEPARATORS = /\s*(?:,|;|\/(?=\s)|\(|\)|\band\b|\bor\b|\busing\b|\bincluding\b|\bsuch as\b|\be\.g\.|:)\s*/i;

const MAX_WORDS = 4;
const MAX_CANDIDATES = 8;

export type SkillCandidate = {
  name: string;
  // Already in your profile (by name or alias): shown, but not addable.
  inProfile: boolean;
};

function clean(part: string): string {
  return part
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .replace(/^(?:the|a|an|other|related)\s+/i, "")
    .replace(/\s+/g, " ");
}

// Parts of the phrase that look like skill names: short, not just filler.
function structuralParts(phrase: string): string[] {
  const strip = (text: string) => text.replace(LEADING_FILLER, "").replace(LEADING_VERBS, "");
  return strip(phrase.trim())
    .split(SEPARATORS)
    .map((part) => clean(strip(part)))
    .filter((part) => {
      const words = part.split(" ").filter(Boolean);
      if (words.length === 0 || words.length > MAX_WORDS || !/[a-z]/i.test(part) || /^\d/.test(part)) return false;
      if (NOT_SKILLS.test(part)) return false;
      // A lone lowercase word from a list ("objects", "forms") is rarely a
      // skill name; real one-word skills are capitalized or already known
      // to the resolver (found above).
      return !(words.length === 1 && part === part.toLowerCase());
    });
}

export function skillCandidates(
  phrase: string,
  resolver: SkillResolver,
  // Canonical keys of skills already in your profile.
  profileKeys: ReadonlySet<string>,
): SkillCandidate[] {
  const byKey = new Map<string, string>();
  // The phrase's own parts first, in order and in the listing's wording
  // ("AWS", not "Amazon Web Services"): that wording is what the keyword
  // check looks for. A part that contains a known skill ("Azure
  // Functions") is kept as is, since it's more specific.
  for (const part of structuralParts(phrase)) {
    const key = resolver.resolve(part).key;
    if (!byKey.has(key)) byKey.set(key, part);
  }
  // Then known skills the parts missed, under their canonical names.
  for (const key of skillKeysIn(phrase, resolver)) {
    if (!byKey.has(key)) byKey.set(key, resolver.resolve(resolver.termsFor(key)[0] ?? key).name);
  }
  // The whole phrase isn't a candidate of its own unless nothing else was
  // found (the dialog handles that case).
  byKey.delete(resolver.resolve(phrase).key);
  return [...byKey.entries()]
    .slice(0, MAX_CANDIDATES)
    .map(([key, name]) => ({ name, inProfile: profileKeys.has(key) || profileKeys.has(skillKey(name)) }));
}
