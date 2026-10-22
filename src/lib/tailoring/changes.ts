import type { ParsedResumeLatex } from "@/lib/latex/resume";
import type { LatexResult } from "@/lib/latex/resume";
import { entryHeadings } from "@/lib/profile/items";
import type { Profile } from "@/lib/profile/types";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import type { SkillResolver } from "@/lib/skills/resolver";
import { resumeToProfileIds } from "@/lib/tailoring/prompt-context";

// The review step (docs/tailored-resumes.md, Step 5c). The model proposes a
// whole resume; you review *changes*. This file:
// - expresses your current resume in the same shape as a proposal;
// - lists every difference as a reviewable change;
// - rebuilds the resume from just the changes you accepted.
// Pure: no I/O, tested on its own.

type Section = TailoringProposal["sections"][number];
type Entry = Section["entries"][number];
type BulletRef = Entry["bullets"][number];

// ---- Your current resume, as a proposal ----

// Every part of the .tex must be in the profile. If something isn't (say
// you deleted it on the Profile page), a section edit would silently drop
// it, so tailoring asks you to re-import first instead.
export function currentAsProposal(
  profile: Profile,
  tex: ParsedResumeLatex,
  resolver: SkillResolver,
): LatexResult<{ proposal: TailoringProposal }> {
  const outOfDate: LatexResult<{ proposal: TailoringProposal }> = {
    ok: false,
    message:
      "Parts of your resume aren't in your profile. Use “Import from active resume” on the Profile page, then generate again.",
  };

  const skillIdByKey = new Map(profile.skills.map((s) => [resolver.resolve(s.name).key, `skill:${s.id}`]));
  const skills: TailoringProposal["skills"] = [];
  for (const category of tex.skills) {
    const skillIds: string[] = [];
    for (const item of category.items) {
      const id = skillIdByKey.get(resolver.resolve(item.text).key);
      if (!id) return outOfDate;
      skillIds.push(id);
    }
    skills.push({ categoryId: category.id, skillIds });
  }

  const sections: Section[] = [];
  for (const section of resumeToProfileIds(profile, tex)) {
    const entries: Entry[] = [];
    for (const entry of section.entries) {
      if (!entry.entryId) return outOfDate;
      const bullets: BulletRef[] = [];
      for (const bullet of entry.bullets) {
        if (!bullet.bulletId) return outOfDate;
        bullets.push({ bulletId: bullet.bulletId, text: bullet.text });
      }
      entries.push({ entryId: entry.entryId, bullets });
    }
    sections.push({ section: section.title, isNew: false, afterSection: null, entries });
  }

  return {
    ok: true,
    proposal: {
      summary: tex.summary ? { text: tex.summary.text, sourceIds: [] } : null,
      skills,
      sections,
      trimOrder: [],
      rationale: "",
    },
  };
}

// ---- Listing the changes ----

export type ChangeKind =
  | "summary"
  | "skills"
  | "section_new"
  | "entry_order"
  | "entry_add"
  | "entry_remove"
  | "bullet_order"
  | "bullet_reword"
  | "bullet_add"
  | "bullet_remove";

export type ReviewChange = {
  // Stable within one proposal, e.g. "bullet_reword:bullet:40".
  id: string;
  kind: ChangeKind;
  // What it's about, for grouping on screen: "Summary", "Skills", or a
  // section title.
  group: string;
  // e.g. an entry heading or a skill category name.
  label: string;
  before: string[];
  after: string[];
};

const changeId = (kind: ChangeKind, key: string) => `${kind}:${key}`;

// Whether the items both lists share appear in a different order.
function orderChanged(before: readonly string[], after: readonly string[]): boolean {
  const shared = new Set(before.filter((id) => after.includes(id)));
  const a = before.filter((id) => shared.has(id));
  const b = after.filter((id) => shared.has(id));
  return a.some((id, index) => id !== b[index]);
}

export function listChanges(
  original: TailoringProposal,
  proposed: TailoringProposal,
  profile: Profile,
  tex: ParsedResumeLatex,
): ReviewChange[] {
  const changes: ReviewChange[] = [];
  const skillName = new Map(profile.skills.map((s) => [`skill:${s.id}`, s.name]));
  const heading = entryHeadings(profile);
  const bulletLines = (entry: Entry) => entry.bullets.map((b) => `• ${b.text}`);

  // Summary
  if (proposed.summary && original.summary && proposed.summary.text !== original.summary.text) {
    changes.push({
      id: "summary",
      kind: "summary",
      group: "Summary",
      label: "Summary",
      before: [original.summary.text],
      after: [proposed.summary.text],
    });
  }

  // Skills, per category (an empty proposal list means "leave skills alone")
  if (proposed.skills.length > 0) {
    const categoryName = new Map(tex.skills.map((c) => [c.id, c.category]));
    const proposedById = new Map(proposed.skills.map((g) => [g.categoryId, g.skillIds]));
    const names = (ids: readonly string[]) => [ids.map((id) => skillName.get(id) ?? id).join(", ")];
    for (const group of original.skills) {
      const after = proposedById.get(group.categoryId) ?? [];
      if (after.join() === group.skillIds.join()) continue;
      changes.push({
        id: changeId("skills", group.categoryId),
        kind: "skills",
        group: "Skills",
        label: after.length === 0 ? `${categoryName.get(group.categoryId)} (removed)` : (categoryName.get(group.categoryId) ?? group.categoryId),
        before: names(group.skillIds),
        after: after.length === 0 ? [] : names(after),
      });
    }
  }

  // Sections
  const originalSections = new Map(original.sections.map((s) => [s.section.toLowerCase(), s]));
  for (const section of proposed.sections) {
    const before = originalSections.get(section.section.toLowerCase());
    if (!before) {
      changes.push({
        id: changeId("section_new", section.section),
        kind: "section_new",
        group: section.section,
        label: `New section: ${section.section}${section.afterSection ? ` (after ${section.afterSection})` : ""}`,
        before: [],
        after: section.entries.flatMap((entry) => [heading(entry.entryId), ...bulletLines(entry)]),
      });
      continue;
    }

    const beforeIds = before.entries.map((e) => e.entryId);
    const afterIds = section.entries.map((e) => e.entryId);
    for (const entry of before.entries) {
      if (afterIds.includes(entry.entryId)) continue;
      changes.push({
        id: changeId("entry_remove", entry.entryId),
        kind: "entry_remove",
        group: section.section,
        label: `Remove ${heading(entry.entryId)}`,
        before: [heading(entry.entryId), ...bulletLines(entry)],
        after: [],
      });
    }
    for (const entry of section.entries) {
      if (beforeIds.includes(entry.entryId)) continue;
      changes.push({
        id: changeId("entry_add", entry.entryId),
        kind: "entry_add",
        group: section.section,
        label: `Add ${heading(entry.entryId)} (from your profile)`,
        before: [],
        after: [heading(entry.entryId), ...bulletLines(entry)],
      });
    }
    if (orderChanged(beforeIds, afterIds)) {
      const shared = (ids: string[], other: string[]) => ids.filter((id) => other.includes(id)).map(heading);
      changes.push({
        id: changeId("entry_order", section.section),
        kind: "entry_order",
        group: section.section,
        label: `Reorder entries in ${section.section}`,
        before: shared(beforeIds, afterIds),
        after: shared(afterIds, beforeIds),
      });
    }

    // Bullets of entries in both
    for (const entry of section.entries) {
      const beforeEntry = before.entries.find((e) => e.entryId === entry.entryId);
      if (!beforeEntry) continue;
      const label = heading(entry.entryId);
      const beforeBullets = new Map(beforeEntry.bullets.map((b) => [b.bulletId, b.text]));
      const afterBulletIds = entry.bullets.map((b) => b.bulletId);

      for (const bullet of beforeEntry.bullets) {
        if (afterBulletIds.includes(bullet.bulletId)) continue;
        changes.push({
          id: changeId("bullet_remove", bullet.bulletId),
          kind: "bullet_remove",
          group: section.section,
          label: `Remove a bullet from ${label}`,
          before: [bullet.text],
          after: [],
        });
      }
      for (const bullet of entry.bullets) {
        const was = beforeBullets.get(bullet.bulletId);
        if (was === undefined) {
          changes.push({
            id: changeId("bullet_add", bullet.bulletId),
            kind: "bullet_add",
            group: section.section,
            label: `Add a bullet to ${label} (from your profile)`,
            before: [],
            after: [bullet.text],
          });
        } else if (was !== bullet.text) {
          changes.push({
            id: changeId("bullet_reword", bullet.bulletId),
            kind: "bullet_reword",
            group: section.section,
            label: `Reword a bullet in ${label}`,
            before: [was],
            after: [bullet.text],
          });
        }
      }
      if (orderChanged(beforeEntry.bullets.map((b) => b.bulletId), afterBulletIds)) {
        const texts = (list: BulletRef[], other: string[]) =>
          list.filter((b) => other.includes(b.bulletId)).map((b) => `• ${beforeBullets.get(b.bulletId) ?? b.text}`);
        changes.push({
          id: changeId("bullet_order", entry.entryId),
          kind: "bullet_order",
          group: section.section,
          label: `Reorder bullets in ${label}`,
          before: texts(beforeEntry.bullets, afterBulletIds),
          after: texts(entry.bullets, beforeEntry.bullets.map((b) => b.bulletId)),
        });
      }
    }
  }
  return changes;
}

// ---- Rebuilding from the accepted changes ----

// Merges two orderings of a list after some changes were rejected:
// `primary` decides the order, and anything only in `extras` is put back
// at its index in `extrasOrder`.
function mergeOrder<T>(primary: T[], extras: T[], extrasOrder: T[]): T[] {
  const result = [...primary];
  for (const item of extras) {
    const index = Math.min(Math.max(extrasOrder.indexOf(item), 0), result.length);
    result.splice(index, 0, item);
  }
  return result;
}

// Rebuilds the resume from just the accepted changes. Rejected changes
// leave that part as it is now. Everything here comes from either the
// checked proposal or your current resume, so the result is as honest as
// both.
export function applySelection(
  original: TailoringProposal,
  proposed: TailoringProposal,
  accepted: ReadonlySet<string>,
): TailoringProposal {
  const summary = accepted.has("summary") ? proposed.summary : null;

  // Skills: the edit replaces the whole block, so build every category.
  let skills: TailoringProposal["skills"] = [];
  if (original.skills.some((group) => accepted.has(changeId("skills", group.categoryId)))) {
    const proposedById = new Map(proposed.skills.map((g) => [g.categoryId, g.skillIds]));
    const order = mergeOrder(
      proposed.skills.map((g) => g.categoryId),
      original.skills.map((g) => g.categoryId).filter((id) => !proposedById.has(id)),
      original.skills.map((g) => g.categoryId),
    );
    skills = order.flatMap((categoryId) => {
      const before = original.skills.find((g) => g.categoryId === categoryId)?.skillIds ?? [];
      const after = proposedById.get(categoryId) ?? [];
      const ids = accepted.has(changeId("skills", categoryId)) ? after : before;
      return ids.length > 0 ? [{ categoryId, skillIds: ids }] : [];
    });
  }

  const originalSections = new Map(original.sections.map((s) => [s.section.toLowerCase(), s]));
  const sections: Section[] = [];
  for (const section of proposed.sections) {
    const before = originalSections.get(section.section.toLowerCase());
    if (!before) {
      if (accepted.has(changeId("section_new", section.section))) sections.push(section);
      continue;
    }

    const beforeIds = before.entries.map((e) => e.entryId);
    const afterIds = section.entries.map((e) => e.entryId);
    const kept = beforeIds.filter((id) => afterIds.includes(id) || !accepted.has(changeId("entry_remove", id)));
    const added = afterIds.filter((id) => !beforeIds.includes(id) && accepted.has(changeId("entry_add", id)));
    const present = new Set([...kept, ...added]);
    const order = accepted.has(changeId("entry_order", section.section))
      ? mergeOrder(afterIds.filter((id) => present.has(id)), kept.filter((id) => !afterIds.includes(id)), beforeIds)
      : mergeOrder(beforeIds.filter((id) => present.has(id)), added, afterIds);

    const entries = order.flatMap((entryId): Entry[] => {
      const beforeEntry = before.entries.find((e) => e.entryId === entryId);
      const afterEntry = section.entries.find((e) => e.entryId === entryId);
      if (!beforeEntry) return afterEntry ? [afterEntry] : [];
      if (!afterEntry) return [beforeEntry];
      return [{ entryId, bullets: selectBullets(beforeEntry, afterEntry, accepted) }];
    });

    const unchanged = JSON.stringify(entries) === JSON.stringify(before.entries);
    if (!unchanged) sections.push({ ...section, entries });
  }

  const present = new Set(sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.map((b) => b.bulletId))));
  return {
    summary,
    skills,
    sections,
    trimOrder: proposed.trimOrder.filter((id) => present.has(id)),
    rationale: proposed.rationale,
  };
}

function selectBullets(before: Entry, after: Entry, accepted: ReadonlySet<string>): BulletRef[] {
  const beforeIds = before.bullets.map((b) => b.bulletId);
  const afterIds = after.bullets.map((b) => b.bulletId);
  const kept = beforeIds.filter((id) => afterIds.includes(id) || !accepted.has(changeId("bullet_remove", id)));
  const added = afterIds.filter((id) => !beforeIds.includes(id) && accepted.has(changeId("bullet_add", id)));
  const present = new Set([...kept, ...added]);
  const order = accepted.has(changeId("bullet_order", before.entryId))
    ? mergeOrder(afterIds.filter((id) => present.has(id)), kept.filter((id) => !afterIds.includes(id)), beforeIds)
    : mergeOrder(beforeIds.filter((id) => present.has(id)), added, afterIds);

  return order.flatMap((bulletId): BulletRef[] => {
    const was = before.bullets.find((b) => b.bulletId === bulletId);
    const now = after.bullets.find((b) => b.bulletId === bulletId);
    if (was && now) return [accepted.has(changeId("bullet_reword", bulletId)) ? now : was];
    const bullet = was ?? now;
    return bullet ? [bullet] : [];
  });
}
