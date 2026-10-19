import { skillKey } from "@/lib/comparison-helpers";
import type { ParsedResumeLatex } from "@/lib/latex/resume";
import type { Profile } from "@/lib/profile/types";

// Planning an import from a parsed .tex into the profile. Pure: it decides
// what to add, and server/db/profile.ts writes it. Imports only ever add;
// re-importing the same .tex adds nothing. See docs/tailored-resumes.md.

// Comparison key for bullets and highlights: case and spacing don't make
// two pieces of text different.
export const textKey = skillKey;

// Links a profile entry to its \resumeSubheading. Built from the title and
// subtitle (e.g. "Web Developer" + the company), not the dates, since an
// end date like "Present" changes while the entry stays the same.
export function entryLatexKey(title: string, subtitle: string): string {
  return `${skillKey(title)}|${skillKey(subtitle)}`;
}

// Splits a summary into sentences, each a candidate highlight. Splits only
// after ". ", "! " or "? " followed by a capital or digit, so "Node.js"
// and "1.8s" stay whole.
export function summarySentences(summary: string): string[] {
  return summary
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

export type NewEntry = {
  section: string;
  title: string;
  dates: string;
  subtitle: string;
  detail: string;
  latexKey: string;
  bullets: string[];
};

export type ImportPlan = {
  skills: { name: string; category: string }[];
  entries: NewEntry[];
  // Bullets to add to entries the profile already has.
  bullets: { entryId: number; texts: string[] }[];
  highlights: string[];
};

export function isEmptyPlan(plan: ImportPlan): boolean {
  return (
    plan.skills.length === 0 &&
    plan.entries.length === 0 &&
    plan.bullets.length === 0 &&
    plan.highlights.length === 0
  );
}

export function planProfileImport(resume: ParsedResumeLatex, profile: Profile): ImportPlan {
  const plan: ImportPlan = { skills: [], entries: [], bullets: [], highlights: [] };

  // Skills: anything whose name or alias the profile already has is skipped.
  const knownSkills = new Set(
    profile.skills.flatMap((skill) => [skill.nameKey, ...skill.aliases.map(skillKey)]),
  );
  for (const category of resume.skills) {
    for (const item of category.items) {
      const key = skillKey(item.text);
      if (knownSkills.has(key)) continue;
      knownSkills.add(key); // Also dedupes a skill listed in two categories.
      plan.skills.push({ name: item.text, category: category.category });
    }
  }

  // Entries: matched by their link to the .tex. A matched entry only gets
  // the bullets it doesn't have yet; an unmatched one is added whole.
  const entriesByKey = new Map(
    profile.entries.flatMap((entry) => (entry.latexKey ? [[entry.latexKey, entry] as const] : [])),
  );
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      const [title, dates, subtitle, detail] = entry.heading;
      const latexKey = entryLatexKey(title, subtitle);
      const texts = uniqueByKey(entry.bullets.map((bullet) => bullet.text));
      const existing = entriesByKey.get(latexKey);

      if (existing) {
        const known = new Set(existing.bullets.map((bullet) => textKey(bullet.text)));
        const missing = texts.filter((text) => !known.has(textKey(text)));
        if (missing.length > 0) plan.bullets.push({ entryId: existing.id, texts: missing });
      } else if (!plan.entries.some((planned) => planned.latexKey === latexKey)) {
        plan.entries.push({ section: section.title, title, dates, subtitle, detail, latexKey, bullets: texts });
      }
    }
  }

  // Highlights: the summary's sentences are your own claims, so they're a
  // good starting set for what a tailored summary may say.
  const knownHighlights = new Set(profile.highlights.map((h) => textKey(h.text)));
  for (const sentence of resume.summary ? summarySentences(resume.summary.text) : []) {
    const key = textKey(sentence);
    if (knownHighlights.has(key)) continue;
    knownHighlights.add(key);
    plan.highlights.push(sentence);
  }

  return plan;
}

function uniqueByKey(texts: string[]): string[] {
  const seen = new Set<string>();
  return texts.filter((text) => {
    const key = textKey(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
