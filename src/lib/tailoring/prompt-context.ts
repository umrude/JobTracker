import type { ParsedResumeLatex } from "@/lib/latex/resume";
import { skillHasContext } from "@/lib/profile/context";
import { entryLatexKey, textKey } from "@/lib/profile/import";
import { entryHeadingText } from "@/lib/profile/items";
import { EXPERIENCE_LABELS, PROFICIENCY_LABELS } from "@/lib/profile/labels";
import type { Profile } from "@/lib/profile/types";
import type { SkillResolver } from "@/lib/skills/resolver";

// What the model sees for tailoring: the current resume and the whole
// profile, both written in profile ids (skill:12, entry:7, bullet:40), so
// the model answers in ids rather than free text. Pure: tested on its own.

export type ComparisonSummary = { matchedSkills: readonly string[]; missingSkills: readonly string[] };

// Where each resume entry and bullet is in the profile, matched the same
// way the import links them: entries by their .tex key, bullets by text.
export function resumeToProfileIds(profile: Profile, tex: ParsedResumeLatex) {
  const entriesByKey = new Map(profile.entries.flatMap((e) => (e.latexKey ? [[e.latexKey, e] as const] : [])));
  return tex.sections.map((section) => ({
    title: section.title,
    entries: section.entries.map((texEntry) => {
      const entry = entriesByKey.get(entryLatexKey(texEntry.heading[0], texEntry.heading[2]));
      const bulletsByText = new Map(entry?.bullets.map((b) => [textKey(b.text), b]) ?? []);
      return {
        entryId: entry ? `entry:${entry.id}` : null,
        heading: entryHeadingText({ title: texEntry.heading[0], subtitle: texEntry.heading[2], dates: texEntry.heading[1] }),
        bullets: texEntry.bullets.map((b) => {
          const match = bulletsByText.get(textKey(b.text));
          return { bulletId: match ? `bullet:${match.id}` : null, text: b.text };
        }),
      };
    }),
  }));
}

export function describeTailoringContext(input: {
  profile: Profile;
  tex: ParsedResumeLatex;
  resolver: SkillResolver;
  comparison: ComparisonSummary | null;
}): string {
  const { profile, tex, resolver, comparison } = input;
  const skillIdByKey = new Map(profile.skills.map((s) => [resolver.resolve(s.name).key, `skill:${s.id}`]));
  const onResume = new Set<string>();
  const lines: string[] = [];

  // ---- The current resume ----
  lines.push("<current_resume>");
  lines.push(tex.summary ? `Summary: ${tex.summary.text}` : "Summary: (none; the resume has no summary section)");
  lines.push("", "Skill categories (use these category ids):");
  for (const category of tex.skills) {
    const items = category.items.map((item) => {
      const id = skillIdByKey.get(resolver.resolve(item.text).key);
      return id ? `${item.text} (${id})` : item.text;
    });
    lines.push(`- ${category.id} ${category.category}: ${items.join(", ")}`);
  }
  lines.push("", "Sections, in order:");
  for (const section of resumeToProfileIds(profile, tex)) {
    lines.push(`## ${section.title}`);
    for (const entry of section.entries) {
      if (entry.entryId) onResume.add(entry.entryId);
      lines.push(`- ${entry.entryId ?? "(not in profile)"} ${entry.heading}`);
      for (const bullet of entry.bullets) lines.push(`  - ${bullet.bulletId ?? "(not in profile)"} ${bullet.text}`);
    }
  }
  lines.push("</current_resume>", "");

  // ---- The whole profile ----
  lines.push("<profile>");
  lines.push("Highlights (facts the summary may use):");
  for (const h of profile.highlights) lines.push(`- highlight:${h.id} ${h.text}`);

  lines.push("", "Skills:");
  for (const skill of profile.skills) {
    const facts = [
      skill.category ? `category: ${skill.category}` : null,
      skill.proficiency ? PROFICIENCY_LABELS[skill.proficiency] : null,
      skill.experience ? EXPERIENCE_LABELS[skill.experience] : null,
      skillHasContext(skill, profile) ? "has context" : "no context: may be listed, never claimed in the summary or bullets",
    ].filter((fact) => fact !== null);
    const never = skill.proficiency === "learning" ? " [LEARNING: never on the resume]" : "";
    lines.push(`- skill:${skill.id} ${skill.name} | ${facts.join(" | ")}${never}`);
    if (skill.note) lines.push(`  note: ${skill.note}`);
  }

  lines.push("", "Entries, by section:");
  const sections = [...new Set(profile.entries.map((e) => e.section))];
  for (const section of sections) {
    lines.push(`## ${section}`);
    for (const entry of profile.entries.filter((e) => e.section === section)) {
      const id = `entry:${entry.id}`;
      const detail = entry.detail ? ` | ${entry.detail}` : "";
      lines.push(`- ${id} ${entryHeadingText(entry)}${detail} | on resume: ${onResume.has(id) ? "yes" : "no"}`);
      for (const bullet of entry.bullets) lines.push(`  - bullet:${bullet.id} ${bullet.text}`);
    }
  }
  lines.push("</profile>");

  if (comparison) {
    lines.push("", "<comparison>");
    lines.push(`Matched skills: ${comparison.matchedSkills.join(", ") || "(none)"}`);
    lines.push(`Gaps: ${comparison.missingSkills.join(", ") || "(none)"}`);
    lines.push("</comparison>");
  }
  return lines.join("\n");
}
