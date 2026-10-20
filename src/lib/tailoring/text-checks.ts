import { skillKey } from "@/lib/comparison-helpers";
import { mentions } from "@/lib/profile/context";
import type { SkillResolver } from "@/lib/skills/resolver";

// The checks the honesty checker runs on any text the model wrote (the
// summary and reworded bullets). Pure functions, tested on their own.

// Every number in a text, normalized: "1,000+" -> "1000", "1.8s" -> "1.8",
// "60%" -> "60". A rewrite may only use numbers its source already has;
// this is what catches invented metrics ("increased sales by 40%").
export function numbersIn(text: string): Set<string> {
  const found = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return new Set(found.map((number) => number.replaceAll(",", "")));
}

// Skill terms that are also ordinary English words. They're not used to
// detect skills in prose, or "the next step" would count as Next.js and
// "go-to debugger" as Go. Their unambiguous forms ("Next.js", "Golang",
// "REST APIs") are still detected. The trade-off: rewording that adds one
// of these words isn't caught by the skill check, so your review catches it.
const AMBIGUOUS_TERMS = new Set(
  [
    "go", "next", "rest", "node", "shell", "spa", "spas", "ws", "ai", "ml", "ts", "ux",
    "express", "nest", "spring", "less", "swift", "unity", "rails", "flask", "jest", "bun",
    "lambda", "ruby", "rust", "agile", "scrum", "excel", "helm", "spark", "airflow", "kube",
    "vue", "elk", "sso", "rtl", "rtk", "pg", "py", "wp", "algorithms", "data structures",
    "unit tests", "shopify", "stripe", "sentry",
  ].map(skillKey),
);

// The canonical keys of every skill a text mentions, using all terms the
// resolver knows (built-in aliases and your profile's).
export function skillKeysIn(text: string, resolver: SkillResolver): Set<string> {
  const lower = text.toLowerCase();
  const keys = new Set<string>();
  for (const { term, key } of resolver.knownTerms()) {
    const termKey = skillKey(term);
    if (termKey === "" || AMBIGUOUS_TERMS.has(termKey)) continue;
    if (mentions(lower, termKey)) keys.add(key);
  }
  return keys;
}

// A rewrite may be at most 20% longer than its source, with a little
// leeway for very short text (a 30-character bullet can still grow by a
// few words). Keeps tailoring from pushing the resume past one page.
export function withinLengthLimit(rewrite: string, source: string): boolean {
  return rewrite.length <= Math.max(Math.ceil(source.length * 1.2), source.length + 15);
}

export type RewriteProblem = "new_number" | "new_skill" | "too_long";

// What's wrong with a rewrite of `source`, if anything.
export function rewriteProblems(rewrite: string, source: string, resolver: SkillResolver): RewriteProblem[] {
  const problems: RewriteProblem[] = [];
  const sourceNumbers = numbersIn(source);
  if ([...numbersIn(rewrite)].some((number) => !sourceNumbers.has(number))) problems.push("new_number");
  const sourceSkills = skillKeysIn(source, resolver);
  if ([...skillKeysIn(rewrite, resolver)].some((key) => !sourceSkills.has(key))) problems.push("new_skill");
  if (!withinLengthLimit(rewrite, source)) problems.push("too_long");
  return problems;
}
