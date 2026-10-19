// Pure helpers for cleaning up comparison output. They're plain functions
// (not baked into the schema) so you can choose where to use them: in a
// post-validation step, or in the stored-result schema's .transform().
// Not in the schema sent to the model: transforms can't become JSON Schema.

// The API can't enforce number bounds (structured outputs drop minimum/
// maximum), so a score of 104 or 87.5 is possible. Rounds and clamps
// into 0-100. NaN becomes 0.
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

// The comparison key for a skill: trimmed, lowercased, inner whitespace
// collapsed. "  Type Script " and "type script" compare equal.
export function skillKey(skill: string): string {
  return skill.trim().replace(/\s+/g, " ").toLowerCase();
}

// Trims each skill, drops blanks, and removes case-insensitive duplicates,
// keeping the first spelling seen (so "TypeScript" wins over "typescript"
// if it came first).
export function normalizeSkills(skills: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim().replace(/\s+/g, " ");
    const key = skillKey(skill);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}

// Removes from `skills` anything that also appears in `exclude`. Useful
// if the model lists a skill as both matched and missing.
export function withoutSkills(
  skills: readonly string[],
  exclude: readonly string[],
): string[] {
  const excluded = new Set(exclude.map(skillKey));
  return skills.filter((skill) => !excluded.has(skillKey(skill)));
}
