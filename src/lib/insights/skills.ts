import type { SkillResolver } from "@/lib/skills/resolver";
import { skillKeysIn } from "@/lib/tailoring/text-checks";

// A comparison's skills are the model's own phrases: "AWS (ECS, RDS, S3)",
// "Go, Rust, or Java", "Production PostgreSQL experience". Counted as is,
// the same skill would be spread across many one-off phrases. So each
// phrase is split into the known skills it mentions (built-in aliases and
// your own), and each of those is counted; a phrase with none stays as
// written. Pure: tested on its own.
//
// The trade-off: skill names that are also ordinary words ("Go", "Rust",
// "Express") aren't detected inside phrases (see text-checks.ts), so "Go,
// Rust, or Java" counts as Java only. Better a missed skill than "the
// next step" counted as Next.js.

type Row = { key: string; name: string; status: "matched" | "missing" };

// Looking a phrase up means checking it against every term the resolver
// knows (about a thousand), and the same phrases repeat across hundreds of
// comparisons, so a run keeps what it found per phrase. Pass one cache to
// every call in a run (docs/performance.md).
export type PhraseCache = Map<string, string[]>;

export function splitSkillPhrases(rows: readonly Row[], resolver: SkillResolver, cache: PhraseCache = new Map()): Row[] {
  const result = new Map<string, Row>();
  const add = (row: Row) => {
    // Within one comparison, a skill that's both matched and missing (two
    // phrases mentioning it) counts as matched, as in comparison rows.
    const existing = result.get(row.key);
    if (!existing || (existing.status === "missing" && row.status === "matched")) result.set(row.key, row);
  };
  for (const row of rows) {
    let keys = cache.get(row.name);
    if (!keys) {
      keys = [...skillKeysIn(row.name, resolver)];
      cache.set(row.name, keys);
    }
    if (keys.length === 0) {
      add(row);
      continue;
    }
    for (const key of keys) add({ key, name: resolver.resolve(resolver.termsFor(key)[0] ?? key).name, status: row.status });
  }
  return [...result.values()];
}
