import { mentions, skillHasContext } from "@/lib/profile/context";
import type { Profile } from "@/lib/profile/types";
import { COVER_LENGTH_WORDS, type CoverLength, type CoverLetterOutput, type LetterWarning } from "@/lib/schemas/cover-letter";
import type { SkillResolver } from "@/lib/skills/resolver";
import { numbersIn, skillKeysIn } from "@/lib/tailoring/text-checks";
import { wordCount } from "@/lib/cover-letter/sources";

// Checks a generated cover letter against your profile, the resume it was
// written from, and the listing. Like the tailoring checker, it runs in
// code; unlike it, it returns *warnings* rather than reverting anything:
// a letter is prose, and a mention can legitimately describe the company
// ("your WebSockets-based console") rather than claim something about you.
// You see the warnings next to the letter and decide.
export function checkCoverLetter(
  letter: CoverLetterOutput,
  context: {
    profile: Profile;
    resumeText: string;
    listing: string;
    resolver: SkillResolver;
    length: CoverLength;
  },
): LetterWarning[] {
  const { profile, resumeText, listing, resolver, length } = context;
  const body = letter.paragraphs.join("\n\n");
  const warnings: LetterWarning[] = [];

  // Numbers: anywhere in your profile, the resume, or the listing (a letter
  // can quote the listing: "a fleet of 50+ robots").
  const corpus = [
    resumeText,
    listing,
    ...profile.highlights.map((h) => h.text),
    ...profile.entries.flatMap((e) => [e.title, e.dates, e.subtitle, e.detail, ...e.bullets.map((b) => b.text)]),
    ...profile.skills.flatMap((s) => (s.note ? [s.note] : [])),
  ].join("\n");
  const known = numbersIn(corpus);
  const newNumbers = [...numbersIn(body)].filter((n) => !known.has(n));
  if (newNumbers.length > 0) {
    warnings.push({
      kinds: ["new_number"],
      message: `It uses ${quote(newNumbers)}, which isn't in your profile, resume, or the listing. Check it's accurate.`,
    });
  }

  // Skills: each one the letter mentions, by how your profile backs it.
  const profileByKey = new Map(profile.skills.map((s) => [resolver.resolve(s.name).key, s]));
  const listingSkills = skillKeysIn(listing, resolver);
  const unknown: string[] = [];
  const noContext: string[] = [];
  const learningClaims: string[] = [];
  // Skills your own words back up, even if they aren't in your skills list
  // ("accessibility" in a bullet about running an accessibility guild).
  const yourWords = skillKeysIn(corpus.replace(listing, ""), resolver);
  for (const key of skillKeysIn(body, resolver)) {
    const skill = profileByKey.get(key);
    const name = skill?.name ?? resolver.termsFor(key)[0] ?? key;
    if (!skill) {
      if (!yourWords.has(key)) unknown.push(name);
    } else if (skill.proficiency === "learning") {
      // Learning skills may only be mentioned as learning: every sentence
      // that names it must also say "learn" (learning, learned, ...).
      const terms = resolver.termsFor(key);
      const claimed = sentences(body).some(
        (sentence) =>
          terms.some((term) => mentions(sentence.toLowerCase(), term.toLowerCase())) && !/\blearn/i.test(sentence),
      );
      if (claimed) learningClaims.push(name);
    } else if (!skillHasContext(skill, profile)) {
      noContext.push(name);
    }
  }
  if (unknown.length > 0) {
    const fromListing = unknown.every((name) => listingSkills.has(resolver.resolve(name).key));
    warnings.push({
      kinds: ["unknown_skill"],
      message: `It mentions ${quote(unknown)}, which isn't in your profile. ${
        fromListing ? "That's fine if it describes the company or role, " : ""
      }make sure it doesn't claim you have it.`,
    });
  }
  if (noContext.length > 0) {
    warnings.push({
      kinds: ["no_context_skill"],
      message: `It mentions ${quote(noContext)}, which your profile lists without saying where you used it. Add a note on the Profile page, or check the letter doesn't overstate it.`,
    });
  }
  if (learningClaims.length > 0) {
    warnings.push({
      kinds: ["learning_claim"],
      message: `It mentions ${quote(learningClaims)}, which you're learning, without saying so. Phrase it as something you're learning.`,
    });
  }

  // Length: within about a third of the target.
  const target = COVER_LENGTH_WORDS[length];
  const words = wordCount(body);
  if (words < target * 0.65 || words > target * 1.35) {
    warnings.push({
      kinds: ["length"],
      message: `It's ${words} words; you asked for about ${target}.`,
    });
  }
  return warnings;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

function quote(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
