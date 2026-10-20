import { skillKey } from "@/lib/comparison-helpers";
import type { Profile, ProfileSkill } from "@/lib/profile/types";

// Whether a skill has "context": something you wrote that shows where you
// used it. A skill with context can be claimed in a tailored summary or
// bullet; one without can only be listed in the skills section, and the
// Profile page labels it "No context" so you can add some. See
// docs/tailored-resumes.md, "Comparison gaps".
//
// Context is any of:
// - a note on the skill;
// - the skill's name (or an alias) in a bullet or highlight;
// - the name in an entry's subtitle or detail, e.g. a project's tech line
//   ("React, Node.js, MongoDB").
export function skillHasContext(skill: ProfileSkill, profile: Profile): boolean {
  if (skill.note && skill.note.trim() !== "") return true;

  const terms = [skill.name, ...skill.aliases].map(skillKey).filter((term) => term !== "");
  const texts = [
    ...profile.entries.flatMap((entry) => [
      entry.subtitle,
      entry.detail,
      ...entry.bullets.map((bullet) => bullet.text),
    ]),
    ...profile.highlights.map((highlight) => highlight.text),
  ].map((text) => text.toLowerCase());

  return terms.some((term) => texts.some((text) => mentions(text, term)));
}

// Whether `text` mentions `term` as a whole term, not inside another word:
// "go" isn't in "good", but "node.js" is in "built node.js apis". Terms
// can contain punctuation (c++, node.js), so the boundaries are "not a
// letter or digit" rather than regex word boundaries.
export function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}
