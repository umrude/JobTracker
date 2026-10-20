import type { SkillResolver } from "@/lib/skills/resolver";

export type ComparisonSkillRow = {
  skillKey: string;
  name: string;
  status: "matched" | "missing";
};

// A comparison's skills as one row per canonical skill. Names are resolved
// first, so "Postgres" and "PostgreSQL" in the same result count once. A
// skill that somehow appears as both matched and missing counts as matched
// (comparisonSchema already removes that overlap; this keeps the rows
// consistent even for older results).
export function comparisonSkillRows(
  comparison: { matchedSkills: readonly string[]; missingSkills: readonly string[] },
  resolver: SkillResolver,
): ComparisonSkillRow[] {
  const rows = new Map<string, ComparisonSkillRow>();
  const add = (names: readonly string[], status: ComparisonSkillRow["status"]) => {
    for (const name of names) {
      const canonical = resolver.resolve(name);
      if (canonical.key === "" || rows.has(canonical.key)) continue;
      rows.set(canonical.key, { skillKey: canonical.key, name: canonical.name, status });
    }
  };
  add(comparison.matchedSkills, "matched");
  add(comparison.missingSkills, "missing");
  return [...rows.values()];
}
