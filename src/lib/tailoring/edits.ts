import { entryHeadings } from "@/lib/profile/items";
import type { Profile } from "@/lib/profile/types";
import type { CheckIssue, Decisions, ReviewEdit, TailoringProposal } from "@/lib/schemas/tailoring";
import type { SkillResolver } from "@/lib/skills/resolver";
import type { ReviewChange } from "@/lib/tailoring/changes";
import { numbersIn, skillKeysIn } from "@/lib/tailoring/text-checks";

// Editing a draft yourself while reviewing (docs/tailored-resumes.md,
// "Editing and revising a draft"). Your edits are a list of small
// operations replayed on top of the checked proposal, which is never
// overwritten:
// - reword the summary or a bullet;
// - remove an entry or a bullet;
// - move an entry or a bullet up or down.
// Review then lists the differences from your current resume as usual, so
// accept/reject, approval, and the LaTeX all work unchanged. Pure: tested
// on its own.

type Section = TailoringProposal["sections"][number];
type Entry = Section["entries"][number];

const sameTitle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function clone(proposal: TailoringProposal): TailoringProposal {
  return structuredClone(proposal);
}

// The proposal's version of a section, copying it in from your current
// resume first if the proposal leaves that section unchanged (a proposal
// only lists the sections it changes).
function ensureSection(result: TailoringProposal, original: TailoringProposal, title: string): Section | undefined {
  const existing = result.sections.find((s) => sameTitle(s.section, title));
  if (existing) return existing;
  const fromOriginal = original.sections.find((s) => sameTitle(s.section, title));
  if (!fromOriginal) return undefined;
  const copy = structuredClone(fromOriginal);
  result.sections.push(copy);
  return copy;
}

// Where an entry is: in the proposal, or in your current resume.
function sectionOfEntry(result: TailoringProposal, original: TailoringProposal, entryId: string): Section | undefined {
  const title = [...result.sections, ...original.sections].find((s) => s.entries.some((e) => e.entryId === entryId))?.section;
  return title === undefined ? undefined : ensureSection(result, original, title);
}

function entryOfBullet(result: TailoringProposal, original: TailoringProposal, bulletId: string): Entry | undefined {
  const holder = [...result.sections, ...original.sections].find((s) =>
    s.entries.some((e) => e.bullets.some((b) => b.bulletId === bulletId)),
  );
  if (!holder) return undefined;
  const entryId = holder.entries.find((e) => e.bullets.some((b) => b.bulletId === bulletId))?.entryId;
  // The bullet may live in the proposal's copy of this entry, not the
  // original's (an entry the proposal added), so look in the result.
  const section = ensureSection(result, original, holder.section);
  return section?.entries.find((e) => e.entryId === entryId && e.bullets.some((b) => b.bulletId === bulletId));
}

function move<T>(list: T[], index: number, direction: "up" | "down"): boolean {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return false;
  [list[index], list[target]] = [list[target], list[index]];
  return true;
}

export type EditOutcome = { ok: true; proposal: TailoringProposal } | { ok: false; message: string };

// Applies one edit, or says why it can't be applied (so the action can
// refuse it instead of storing something that does nothing).
export function applyEdit(proposal: TailoringProposal, original: TailoringProposal, edit: ReviewEdit): EditOutcome {
  const result = clone(proposal);
  switch (edit.op) {
    case "text": {
      if (edit.itemId === "summary") {
        const base = result.summary ?? original.summary;
        if (!base) return { ok: false, message: "This resume has no summary to edit." };
        result.summary = { ...base, text: edit.text };
        return { ok: true, proposal: result };
      }
      const entry = entryOfBullet(result, original, edit.itemId);
      const bullet = entry?.bullets.find((b) => b.bulletId === edit.itemId);
      if (!bullet) return { ok: false, message: "That bullet isn't on this resume any more." };
      bullet.text = edit.text;
      return { ok: true, proposal: result };
    }
    case "remove_entry":
    case "move_entry": {
      const section = sectionOfEntry(result, original, edit.entryId);
      const index = section?.entries.findIndex((e) => e.entryId === edit.entryId) ?? -1;
      if (!section || index < 0) return { ok: false, message: "That entry isn't on this resume any more." };
      if (edit.op === "move_entry") {
        return move(section.entries, index, edit.direction) ? { ok: true, proposal: result } : { ok: false, message: "It can't move further." };
      }
      // An empty section would leave a broken heading in the PDF.
      if (section.entries.length === 1) {
        return { ok: false, message: `That's the only entry in ${section.section}, so it can't be removed.` };
      }
      section.entries.splice(index, 1);
      // Its bullets are gone, so they can't be trim suggestions any more.
      return { ok: true, proposal: { ...result, trimOrder: result.trimOrder.filter((id) => present(result, id)) } };
    }
    case "remove_bullet":
    case "move_bullet": {
      const entry = entryOfBullet(result, original, edit.bulletId);
      const index = entry?.bullets.findIndex((b) => b.bulletId === edit.bulletId) ?? -1;
      if (!entry || index < 0) return { ok: false, message: "That bullet isn't on this resume any more." };
      if (edit.op === "move_bullet") {
        return move(entry.bullets, index, edit.direction) ? { ok: true, proposal: result } : { ok: false, message: "It can't move further." };
      }
      // An entry with no bullets doesn't compile (\resumeItemListStart with
      // nothing in it), so the last one stays.
      if (entry.bullets.length === 1) return { ok: false, message: "That's the entry's only bullet, so it can't be removed." };
      entry.bullets.splice(index, 1);
      return { ok: true, proposal: { ...result, trimOrder: result.trimOrder.filter((id) => id !== edit.bulletId) } };
    }
  }
}

function present(proposal: TailoringProposal, bulletId: string): boolean {
  return proposal.sections.some((s) => s.entries.some((e) => e.bullets.some((b) => b.bulletId === bulletId)));
}

// Replays every stored edit. One that no longer applies (say, its bullet
// was removed from your profile) is skipped rather than failing the page.
export function applyEdits(proposal: TailoringProposal, original: TailoringProposal, edits: readonly ReviewEdit[]): TailoringProposal {
  let result = proposal;
  for (const edit of edits) {
    const outcome = applyEdit(result, original, edit);
    if (outcome.ok) result = outcome.proposal;
  }
  return result;
}

// The item an edit is about: "summary", an entry id, or a bullet id.
export function editItemId(edit: ReviewEdit): string {
  if (edit.op === "text") return edit.itemId;
  return "entryId" in edit ? edit.entryId : edit.bulletId;
}

// "Reset": your edits to one item dropped, back to the proposal's version.
export function withoutEditsFor(edits: readonly ReviewEdit[], itemId: string): ReviewEdit[] {
  return edits.filter((edit) => editItemId(edit) !== itemId);
}

// ---- The outline: the whole proposed resume, for structural edits ----

export type OutlineBullet = { bulletId: string; text: string; edited: boolean };
export type OutlineEntry = { entryId: string; heading: string; edited: boolean; bullets: OutlineBullet[] };
export type OutlineSection = { title: string; isNew: boolean; entries: OutlineEntry[] };
export type Outline = { summary: { text: string; edited: boolean } | null; sections: OutlineSection[] };

// The proposed resume with every change applied, section by section, in
// resume order: your current sections (the proposal's version where it
// changed one), then new ones. This is where you remove or move entries
// and bullets the model didn't touch.
export function buildOutline(
  effective: TailoringProposal,
  original: TailoringProposal,
  edits: readonly ReviewEdit[],
  profile: Profile,
): Outline {
  const edited = new Set(edits.map(editItemId));
  const heading = entryHeadings(profile);
  const toOutline = (section: Section): OutlineSection => ({
    title: section.section,
    isNew: section.isNew,
    entries: section.entries.map((entry) => ({
      entryId: entry.entryId,
      heading: heading(entry.entryId),
      edited: edited.has(entry.entryId),
      bullets: entry.bullets.map((b) => ({ bulletId: b.bulletId, text: b.text, edited: edited.has(b.bulletId) })),
    })),
  });

  const sections = original.sections.map((section) =>
    toOutline(effective.sections.find((s) => sameTitle(s.section, section.section)) ?? section),
  );
  for (const section of effective.sections.filter((s) => s.isNew)) {
    const after = section.afterSection ? sections.findIndex((s) => sameTitle(s.title, section.afterSection ?? "")) : -1;
    sections.splice(after >= 0 ? after + 1 : sections.length, 0, toOutline(section));
  }

  const summary = effective.summary ?? original.summary;
  return { summary: summary ? { text: summary.text, edited: edited.has("summary") } : null, sections };
}

// ---- Checking your own wording ----

// Your words are yours: they're never reverted. But a number or skill
// your profile doesn't have is flagged, because the profile is what keeps
// future tailoring honest: if it's true, add it there.
export function checkYourText(
  edits: readonly ReviewEdit[],
  profile: Profile,
  resolver: SkillResolver,
): CheckIssue[] {
  // Only your latest wording of each item counts.
  const latest = new Map<string, string>();
  for (const edit of edits) if (edit.op === "text") latest.set(edit.itemId, edit.text);

  const corpus = [
    ...profile.highlights.map((h) => h.text),
    ...profile.entries.flatMap((e) => [e.title, e.dates, e.subtitle, e.detail, ...e.bullets.map((b) => b.text)]),
    ...profile.skills.flatMap((s) => (s.note ? [s.note] : [])),
  ].join("\n");
  const knownNumbers = numbersIn(corpus);
  const usable = new Set(profile.skills.filter((s) => s.proficiency !== "learning").map((s) => resolver.resolve(s.name).key));
  const learning = new Set(profile.skills.filter((s) => s.proficiency === "learning").map((s) => resolver.resolve(s.name).key));

  const issues: CheckIssue[] = [];
  for (const [itemId, text] of latest) {
    const numbers = [...numbersIn(text)].filter((n) => !knownNumbers.has(n));
    const skills = [...skillKeysIn(text, resolver)];
    const missing = skills.filter((key) => !usable.has(key) && !learning.has(key));
    const learningUsed = skills.filter((key) => learning.has(key));
    const what = itemId === "summary" ? "Your summary" : "Your wording of a bullet";
    if (numbers.length > 0) {
      issues.push({
        itemId,
        kinds: ["new_number"],
        message: `${what} mentions ${numbers.map((n) => `"${n}"`).join(", ")}, which isn't in your profile. If it's true, add it to your profile so tailoring can use it too.`,
        resolution: "kept_yours",
      });
    }
    if (missing.length > 0) {
      issues.push({
        itemId,
        kinds: ["new_skill"],
        message: `${what} mentions ${missing.map((k) => (resolver.termsFor(k)[0] ?? k)).join(", ")}, which isn't in your profile. Add it there if you have it.`,
        resolution: "kept_yours",
      });
    }
    if (learningUsed.length > 0) {
      issues.push({
        itemId,
        kinds: ["learning_skill"],
        message: `${what} mentions ${learningUsed.map((k) => (resolver.termsFor(k)[0] ?? k)).join(", ")}, which your profile marks as Learning.`,
        resolution: "kept_yours",
      });
    }
  }
  return issues;
}

// ---- Keeping your decisions as the changes shift ----

// After an edit or a revision, the list of changes is different. A
// decision carries over only for a change that's still there and still
// says the same thing. A change that's new or now says something else
// gets `changed`: accepted after your own edit (you made it), undecided
// after a revision (you haven't seen it).
export function carryDecisions(
  before: readonly ReviewChange[],
  after: readonly ReviewChange[],
  decisions: Decisions,
  changed: "accepted" | undefined,
): Decisions {
  const previous = new Map(before.map((c) => [c.id, JSON.stringify(c.after)]));
  const result: Decisions = {};
  for (const change of after) {
    const same = previous.get(change.id) === JSON.stringify(change.after);
    const decision = same ? decisions[change.id] : changed;
    if (decision) result[change.id] = decision;
  }
  return result;
}

// The item whose wording a change is about: "summary" for the summary
// change, "bullet:40" for a reworded or added bullet, null for structural
// changes (moves, removals, skills). Used to tell which of your own
// wordings a revision note asks to change.
export function wordedItemOf(changeId: string): string | null {
  if (changeId === "summary") return "summary";
  const match = /^bullet_(?:reword|add):(bullet:\d+)$/.exec(changeId);
  return match ? match[1] : null;
}
