import { applyResumeEdits, type LatexResult, type ParsedResumeLatex } from "@/lib/latex/resume";
import type { Profile } from "@/lib/profile/types";
import type { ResumeEdits } from "@/lib/schemas/resume-edits";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import type { SkillResolver } from "@/lib/skills/resolver";
import { applySelection, currentAsProposal, listChanges } from "@/lib/tailoring/changes";
import { toResumeEdits } from "@/lib/tailoring/to-edits";

// Approval, as one pure function shared by the app, the seed, and tests:
// your accepted changes -> the final resume -> LaTeX edits -> the LaTeX.
//
// What gets stored is the LaTeX *edits* (plain text plus positions in this
// resume version's .tex), not profile ids. The .tex of a resume version
// never changes, so the approved PDF can always be rebuilt exactly, even
// after you edit or delete profile items. That's the "snapshot" rule.

export type Approval = {
  // The final resume in profile ids (kept for trimming later).
  final: TailoringProposal;
  edits: ResumeEdits;
  tex: string;
};

export function buildApproval(input: {
  proposed: TailoringProposal;
  accepted: readonly string[];
  profile: Profile;
  tex: ParsedResumeLatex;
  latexSource: string;
  resolver: SkillResolver;
}): LatexResult<{ approval: Approval }> {
  const current = currentAsProposal(input.profile, input.tex, input.resolver);
  if (!current.ok) return current;

  // Accepted ids must be changes this proposal actually has: a stray id
  // from a tampered request can't slip in something that wasn't proposed.
  const known = new Set(listChanges(current.proposal, input.proposed, input.profile, input.tex).map((c) => c.id));
  const unknown = input.accepted.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return { ok: false, message: "Some accepted changes aren't part of this proposal. Reload the page and review again." };
  }

  const final = applySelection(current.proposal, input.proposed, new Set(input.accepted));
  return finish(final, input.profile, input.tex, input.latexSource);
}

// Removes bullets (and whole entries) to fit one page, from an already-
// approved resume. Works
// on the full resume (approved sections plus the untouched ones), so any
// bullet can be removed, but never an entry's last one.
export function trimApproval(input: {
  final: TailoringProposal;
  removeBulletIds: readonly string[];
  removeEntryIds?: readonly string[];
  profile: Profile;
  tex: ParsedResumeLatex;
  latexSource: string;
  resolver: SkillResolver;
}): LatexResult<{ approval: Approval }> {
  const current = currentAsProposal(input.profile, input.tex, input.resolver);
  if (!current.ok) return current;

  // Every id the approval uses must still be in the profile.
  const profileIds = new Set([
    ...input.profile.entries.map((e) => `entry:${e.id}`),
    ...input.profile.entries.flatMap((e) => e.bullets.map((b) => `bullet:${b.id}`)),
    ...input.profile.skills.map((s) => `skill:${s.id}`),
  ]);
  const usedIds = [
    ...input.final.skills.flatMap((g) => g.skillIds),
    ...input.final.sections.flatMap((s) => s.entries.flatMap((e) => [e.entryId, ...e.bullets.map((b) => b.bulletId)])),
  ];
  if (usedIds.some((id) => !profileIds.has(id))) {
    return { ok: false, message: "Your profile changed since this was approved. Generate a new version to trim it." };
  }

  const remove = new Set(input.removeBulletIds);
  const removeEntries = new Set(input.removeEntryIds ?? []);
  const sections = mergedSections(current.proposal, input.final).map((section) => {
    // Never a section's last entry: an empty section breaks the PDF.
    const keptEntries = section.entries.filter((entry) => !removeEntries.has(entry.entryId));
    return {
      ...section,
      entries: (keptEntries.length > 0 ? keptEntries : section.entries).map((entry) => {
        const kept = entry.bullets.filter((b) => !remove.has(b.bulletId));
        return { ...entry, bullets: kept.length > 0 ? kept : entry.bullets };
      }),
    };
  });
  const keptBullets = new Set(sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.map((b) => b.bulletId))));

  return finish({ ...input.final, sections, trimOrder: input.final.trimOrder.filter((id) => keptBullets.has(id)) }, input.profile, input.tex, input.latexSource);
}

// The full approved resume, section by section: approved sections replace
// their originals, untouched ones stay, new ones follow.
export function mergedSections(current: TailoringProposal, final: TailoringProposal): TailoringProposal["sections"] {
  const approvedByTitle = new Map(final.sections.map((s) => [s.section.toLowerCase(), s]));
  return [
    ...current.sections.map((s) => approvedByTitle.get(s.section.toLowerCase()) ?? s),
    ...final.sections.filter((s) => s.isNew),
  ];
}

function finish(
  final: TailoringProposal,
  profile: Profile,
  tex: ParsedResumeLatex,
  latexSource: string,
): LatexResult<{ approval: Approval }> {
  const edits = toResumeEdits(final, profile, tex);
  const applied = applyResumeEdits(latexSource, edits);
  if (!applied.ok) return applied;
  return { ok: true, approval: { final, edits, tex: applied.tex } };
}
