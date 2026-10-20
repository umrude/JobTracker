import type { ParsedResumeLatex, ResumeEntry } from "@/lib/latex/resume";
import { entryLatexKey } from "@/lib/profile/import";
import type { Profile, ProfileEntry } from "@/lib/profile/types";
import type { EntryEdit, ResumeEdits } from "@/lib/schemas/resume-edits";
import type { TailoringProposal } from "@/lib/schemas/tailoring";

// Turns a checked proposal (profile ids) into LaTeX edits (positions in
// your .tex), for applyResumeEdits. Run it only on output from
// checkProposal: it trusts that every id exists.
//
// Profile owns content, the .tex owns presentation: an entry that's in
// the .tex keeps its exact LaTeX when its heading is unchanged, but if
// you've edited the heading on the Profile page, it's rebuilt from the
// profile. Entries not in the .tex are built new from the profile.

export function toResumeEdits(proposal: TailoringProposal, profile: Profile, tex: ParsedResumeLatex): ResumeEdits {
  const skills = new Map(profile.skills.map((skill) => [`skill:${skill.id}`, skill]));
  const entries = new Map(profile.entries.map((entry) => [`entry:${entry.id}`, entry]));
  const texEntries = new Map(
    tex.sections.flatMap((section) =>
      section.entries.map((entry) => [entryLatexKey(entry.heading[0], entry.heading[2]), entry] as const),
    ),
  );

  const edits: ResumeEdits = {};
  if (proposal.summary) edits.summary = proposal.summary.text;

  const skillGroups = proposal.skills
    .map((group) => ({
      categoryId: group.categoryId,
      items: group.skillIds.flatMap((id) => {
        const skill = skills.get(id);
        return skill ? [skill.name] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);
  if (skillGroups.length > 0) edits.skills = skillGroups;

  const sections: NonNullable<ResumeEdits["sections"]> = [];
  for (const section of proposal.sections) {
    const entryEdits = section.entries.flatMap((proposed): EntryEdit[] => {
      const entry = entries.get(proposed.entryId);
      if (!entry) return [];
      const bullets = proposed.bullets.map((bullet) => bullet.text);
      const linked = entry.latexKey ? texEntries.get(entry.latexKey) : undefined;
      if (linked && headingMatches(entry, linked)) return [{ entryId: linked.id, bullets }];
      return [{ heading: [entry.title, entry.dates, entry.subtitle, entry.detail], bullets }];
    });
    if (entryEdits.length === 0) continue;
    sections.push(
      section.isNew
        ? { newTitle: section.section, afterSection: section.afterSection, entries: entryEdits }
        : { title: section.section, entries: entryEdits },
    );
  }
  if (sections.length > 0) edits.sections = sections;

  return edits;
}

// Whether the .tex entry still shows the profile entry's heading. The
// profile stores the heading as plain text, as parsed from the .tex.
function headingMatches(entry: ProfileEntry, texEntry: ResumeEntry): boolean {
  const [title, dates, subtitle, detail] = texEntry.heading;
  return entry.title === title && entry.dates === dates && entry.subtitle === subtitle && entry.detail === detail;
}
