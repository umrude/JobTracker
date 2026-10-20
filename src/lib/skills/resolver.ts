import { skillKey } from "@/lib/comparison-helpers";
import { mentions } from "@/lib/profile/context";
import { SKILL_ALIASES } from "@/lib/skills/aliases";

// Maps any skill name to one canonical skill, so "Postgres", "postgres",
// and "PostgreSQL" count as the same thing across resumes, profiles, and
// listings. Built from the built-in alias list plus your own profile
// aliases. Pure: no I/O.

export type CanonicalSkill = {
  // Stable comparison key, e.g. "postgresql". Stored with comparisons.
  key: string;
  // Display name, e.g. "PostgreSQL".
  name: string;
};

export type SkillResolver = {
  resolve(name: string): CanonicalSkill;
  // Every known way of writing the skill with this canonical key: its
  // name and all aliases (built-in and yours).
  termsFor(key: string): string[];
  // Every known term with its canonical key, for finding skills in prose.
  knownTerms(): { term: string; key: string }[];
};

export function createSkillResolver(
  profileSkills: readonly { name: string; aliases: readonly string[] }[] = [],
): SkillResolver {
  const byTerm = new Map<string, CanonicalSkill>();
  const terms = new Map<string, Set<string>>();

  const link = (term: string, canonical: CanonicalSkill, overwrite: boolean) => {
    const termKey = skillKey(term);
    if (termKey === "") return;
    if (overwrite || !byTerm.has(termKey)) byTerm.set(termKey, canonical);
    const set = terms.get(canonical.key) ?? new Set<string>();
    set.add(term.trim());
    terms.set(canonical.key, set);
  };

  for (const [name, aliases] of Object.entries(SKILL_ALIASES)) {
    const canonical = { key: skillKey(name), name };
    link(name, canonical, true);
    for (const alias of aliases) link(alias, canonical, true);
  }

  // Your skills join the built-in ones: a profile skill the list knows
  // ("Postgres") resolves to its built-in canonical name, and your own
  // aliases resolve to your skill. Where your alias contradicts the list,
  // yours wins: it's your profile, and you confirmed it.
  for (const skill of profileSkills) {
    const canonical = byTerm.get(skillKey(skill.name)) ?? { key: skillKey(skill.name), name: skill.name.trim() };
    link(skill.name, canonical, false);
    for (const alias of skill.aliases) link(alias, canonical, true);
  }

  return {
    resolve(name) {
      const key = skillKey(name);
      return byTerm.get(key) ?? { key, name: name.trim() };
    },
    termsFor(key) {
      return [...(terms.get(key) ?? [])];
    },
    knownTerms() {
      return [...terms].flatMap(([key, set]) => [...set].map((term) => ({ term, key })));
    },
  };
}

// Profile skills whose names are close to `name` without being the same
// skill: one contains the other as a whole term ("ECS" and "AWS ECS"). Used
// to ask "Is this the same as …?"; you decide, because a close name can
// still be a different skill ("React" and "React Native").
export function similarSkills<T extends { name: string }>(name: string, skills: readonly T[], limit = 3): T[] {
  const key = skillKey(name);
  if (key === "") return [];
  return skills
    .filter((skill) => {
      const other = skillKey(skill.name);
      return other !== key && (mentions(key, other) || mentions(other, key));
    })
    .slice(0, limit);
}
