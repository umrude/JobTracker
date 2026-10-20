import { skillHasContext } from "@/lib/profile/context";
import type { ParsedResumeLatex } from "@/lib/latex/resume";
import type { Profile, ProfileBullet, ProfileEntry, ProfileSkill } from "@/lib/profile/types";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import type { SkillResolver } from "@/lib/skills/resolver";
import { numbersIn, skillKeysIn, withinLengthLimit } from "@/lib/tailoring/text-checks";

// The honesty checker. It runs on the model's proposal before you see it,
// in plain code, so "never invent anything" doesn't rest on the prompt
// alone. Every rule removes the offending item or reverts it to your own
// words, and records an issue saying what happened; the review screen
// shows those as flags. See docs/tailored-resumes.md, Step 5.
//
// The rules:
// - Everything must exist in your profile: skill, entry, and bullet ids.
// - Learning skills never appear on the resume.
// - A bullet stays with its own entry, and an entry with its own section.
// - A rewrite (summary or bullet) may not add a number or a skill its
//   source doesn't have, and may grow at most ~20%.
// - The summary may only mention skills you have with context, and only
//   numbers that appear somewhere in your profile.

export type IssueKind =
  | "unknown_id"
  | "learning_skill"
  | "unknown_category"
  | "moved_bullet"
  | "wrong_section"
  | "new_number"
  | "new_skill"
  | "too_long"
  | "empty_text"
  | "unbacked_skill"
  | "empty_entry"
  | "unknown_section";

export type CheckIssue = {
  // The proposal item this is about, e.g. "bullet:40", "summary".
  itemId: string;
  kinds: IssueKind[];
  message: string;
  resolution: "removed" | "kept_original";
};

export type CheckResult = { proposal: TailoringProposal; issues: CheckIssue[] };

export type CheckContext = {
  profile: Profile;
  tex: ParsedResumeLatex;
  resolver: SkillResolver;
};

export function checkProposal(proposal: TailoringProposal, context: CheckContext): CheckResult {
  const issues: CheckIssue[] = [];
  const index = indexProfile(context.profile);
  const summary = checkSummary(proposal, context, index, issues);
  const skills = checkSkills(proposal, context, index, issues);
  const sections = checkSections(proposal, context, index, issues);

  const keptBullets = new Set(
    sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.bulletId))),
  );
  return {
    proposal: {
      summary,
      skills,
      sections,
      trimOrder: proposal.trimOrder.filter((id) => keptBullets.has(id)),
      rationale: proposal.rationale,
    },
    issues,
  };
}

type ProfileIndex = {
  skills: Map<string, ProfileSkill>;
  entries: Map<string, ProfileEntry>;
  bullets: Map<string, ProfileBullet>;
  highlightIds: Set<string>;
};

function indexProfile(profile: Profile): ProfileIndex {
  return {
    skills: new Map(profile.skills.map((skill) => [`skill:${skill.id}`, skill])),
    entries: new Map(profile.entries.map((entry) => [`entry:${entry.id}`, entry])),
    bullets: new Map(profile.entries.flatMap((entry) => entry.bullets.map((bullet) => [`bullet:${bullet.id}`, bullet]))),
    highlightIds: new Set(profile.highlights.map((highlight) => `highlight:${highlight.id}`)),
  };
}

// A readable name for each canonical skill key, for issue messages.
function skillNames(keys: Iterable<string>, resolver: SkillResolver): string {
  return [...keys].map((key) => `"${resolver.termsFor(key)[0] ?? key}"`).join(", ");
}

function quoteList(values: Iterable<string>): string {
  return [...values].map((value) => `"${value}"`).join(", ");
}

// ---- Summary ----

function checkSummary(
  proposal: TailoringProposal,
  { profile, tex, resolver }: CheckContext,
  index: ProfileIndex,
  issues: CheckIssue[],
): TailoringProposal["summary"] {
  const original = tex.summary?.text;
  // No summary section to rewrite, or no change proposed.
  if (!proposal.summary || original === undefined) return null;

  const text = proposal.summary.text.trim();
  const keepOriginal = (kinds: IssueKind[], message: string) => {
    issues.push({ itemId: "summary", kinds, message, resolution: "kept_original" });
    return null;
  };
  if (text === "") return keepOriginal(["empty_text"], "The proposed summary was empty, so your original is kept.");

  // Numbers must appear somewhere in your profile (or your own summary).
  const corpus = [
    original,
    ...profile.highlights.map((highlight) => highlight.text),
    ...profile.entries.flatMap((entry) => [entry.title, entry.dates, entry.subtitle, entry.detail, ...entry.bullets.map((b) => b.text)]),
    ...profile.skills.flatMap((skill) => (skill.note ? [skill.note] : [])),
  ].join("\n");
  const knownNumbers = numbersIn(corpus);
  const newNumbers = [...numbersIn(text)].filter((number) => !knownNumbers.has(number));

  // Skills must be ones you have, not Learning, and with context. Skills
  // your own summary already mentions are fine: they're your words.
  const originalSkills = skillKeysIn(original, resolver);
  const backed = new Set(
    profile.skills
      .filter((skill) => skill.proficiency !== "learning" && skillHasContext(skill, profile))
      .map((skill) => resolver.resolve(skill.name).key),
  );
  const unbacked = [...skillKeysIn(text, resolver)].filter((key) => !backed.has(key) && !originalSkills.has(key));

  const kinds: IssueKind[] = [];
  const reasons: string[] = [];
  if (newNumbers.length > 0) {
    kinds.push("new_number");
    reasons.push(`it used ${quoteList(newNumbers)}, which isn't in your profile`);
  }
  if (unbacked.length > 0) {
    kinds.push("unbacked_skill");
    reasons.push(`it claimed ${skillNames(unbacked, resolver)}, which your profile doesn't back up`);
  }
  if (!withinLengthLimit(text, original)) {
    kinds.push("too_long");
    reasons.push("it was more than 20% longer than your current summary");
  }
  if (kinds.length > 0) {
    return keepOriginal(kinds, `The proposed summary was not used: ${reasons.join("; ")}. Your original is kept.`);
  }

  const sourceIds = proposal.summary.sourceIds.filter((id) => index.highlightIds.has(id) || index.bullets.has(id));
  return { text, sourceIds };
}

// ---- Skills ----

function checkSkills(
  proposal: TailoringProposal,
  { tex }: CheckContext,
  index: ProfileIndex,
  issues: CheckIssue[],
): TailoringProposal["skills"] {
  const categories = new Set(tex.skills.map((category) => category.id));
  const used = new Set<string>();
  const groups: TailoringProposal["skills"] = [];

  for (const group of proposal.skills) {
    if (!categories.has(group.categoryId)) {
      issues.push({
        itemId: group.categoryId,
        kinds: ["unknown_category"],
        message: `A skill category that isn't in your resume ("${group.categoryId}") was proposed and has been removed.`,
        resolution: "removed",
      });
      continue;
    }
    const skillIds: string[] = [];
    for (const id of group.skillIds) {
      const skill = index.skills.get(id);
      if (!skill) {
        issues.push({ itemId: id, kinds: ["unknown_id"], message: `A skill that isn't in your profile (${id}) was removed.`, resolution: "removed" });
        continue;
      }
      if (skill.proficiency === "learning") {
        issues.push({
          itemId: id,
          kinds: ["learning_skill"],
          message: `"${skill.name}" is marked Learning, so it was removed from the resume.`,
          resolution: "removed",
        });
        continue;
      }
      if (used.has(id)) continue;
      used.add(id);
      skillIds.push(id);
    }
    if (skillIds.length > 0) groups.push({ categoryId: group.categoryId, skillIds });
  }
  return groups;
}

// ---- Sections, entries, and bullets ----

function checkSections(
  proposal: TailoringProposal,
  { tex, resolver }: CheckContext,
  index: ProfileIndex,
  issues: CheckIssue[],
): TailoringProposal["sections"] {
  const texSections = new Map(tex.sections.map((section) => [section.title.toLowerCase(), section.title]));
  const usedEntries = new Set<string>();
  const usedBullets = new Set<string>();
  const result: TailoringProposal["sections"] = [];

  for (const section of proposal.sections) {
    const existingTitle = texSections.get(section.section.toLowerCase());
    // The model's isNew flag is advisory: whether a section exists is a
    // fact about your .tex.
    const isNew = existingTitle === undefined;
    const title = existingTitle ?? section.section.trim();
    const afterSection =
      isNew && section.afterSection !== null ? (texSections.get(section.afterSection.toLowerCase()) ?? null) : null;

    const entries: TailoringProposal["sections"][number]["entries"] = [];
    for (const proposed of section.entries) {
      const entry = index.entries.get(proposed.entryId);
      if (!entry) {
        issues.push({
          itemId: proposed.entryId,
          kinds: ["unknown_id"],
          message: `An entry that isn't in your profile (${proposed.entryId}) was removed.`,
          resolution: "removed",
        });
        continue;
      }
      if (usedEntries.has(proposed.entryId)) continue;
      if (entry.section.toLowerCase() !== title.toLowerCase()) {
        issues.push({
          itemId: proposed.entryId,
          kinds: ["wrong_section"],
          message: `"${entry.title}" belongs in ${entry.section}, not ${title}, so it was removed from ${title}.`,
          resolution: "removed",
        });
        continue;
      }
      usedEntries.add(proposed.entryId);
      entries.push({ entryId: proposed.entryId, bullets: checkBullets(entry, proposed.bullets, index, resolver, usedBullets, issues) });
    }

    if (entries.length === 0) {
      if (section.entries.length > 0) {
        issues.push({
          itemId: `section:${title}`,
          kinds: isNew ? ["unknown_section"] : ["empty_entry"],
          message: isNew
            ? `The proposed new section "${title}" had nothing usable, so it was left out.`
            : `Nothing usable was proposed for ${title}, so it's left as it is.`,
          resolution: isNew ? "removed" : "kept_original",
        });
      }
      continue;
    }
    result.push({ section: title, isNew, afterSection, entries });
  }
  return result;
}

function checkBullets(
  entry: ProfileEntry,
  proposed: TailoringProposal["sections"][number]["entries"][number]["bullets"],
  index: ProfileIndex,
  resolver: SkillResolver,
  usedBullets: Set<string>,
  issues: CheckIssue[],
): { bulletId: string; text: string }[] {
  const bullets: { bulletId: string; text: string }[] = [];

  for (const { bulletId, text } of proposed) {
    const source = index.bullets.get(bulletId);
    if (!source) {
      issues.push({ itemId: bulletId, kinds: ["unknown_id"], message: `A bullet that isn't in your profile (${bulletId}) was removed.`, resolution: "removed" });
      continue;
    }
    if (source.entryId !== entry.id) {
      issues.push({
        itemId: bulletId,
        kinds: ["moved_bullet"],
        message: `A bullet from another entry was placed under "${entry.title}"; bullets stay with their own entry, so it was removed there.`,
        resolution: "removed",
      });
      continue;
    }
    if (usedBullets.has(bulletId)) continue;
    usedBullets.add(bulletId);

    const rewrite = text.trim();
    if (rewrite === "" || rewrite === source.text) {
      bullets.push({ bulletId, text: source.text });
      continue;
    }

    const sourceNumbers = numbersIn(source.text);
    const newNumbers = [...numbersIn(rewrite)].filter((number) => !sourceNumbers.has(number));
    const sourceSkills = skillKeysIn(source.text, resolver);
    const newSkills = [...skillKeysIn(rewrite, resolver)].filter((key) => !sourceSkills.has(key));
    const kinds: IssueKind[] = [];
    const reasons: string[] = [];
    if (newNumbers.length > 0) {
      kinds.push("new_number");
      reasons.push(`added ${quoteList(newNumbers)}`);
    }
    if (newSkills.length > 0) {
      kinds.push("new_skill");
      reasons.push(`added ${skillNames(newSkills, resolver)}`);
    }
    if (!withinLengthLimit(rewrite, source.text)) {
      kinds.push("too_long");
      reasons.push("grew more than 20%");
    }

    if (kinds.length > 0) {
      issues.push({
        itemId: bulletId,
        kinds,
        message: `A rewording of “${source.text}” ${reasons.join(" and ")}, which the original doesn't support, so the original is kept.`,
        resolution: "kept_original",
      });
      bullets.push({ bulletId, text: source.text });
    } else {
      bullets.push({ bulletId, text: rewrite });
    }
  }

  // An entry with bullets in your profile can't end up with none: an empty
  // list doesn't compile, and dropping all of a job's bullets is rarely
  // intended. Its bullets are kept as they are.
  if (bullets.length === 0 && entry.bullets.length > 0) {
    issues.push({
      itemId: `entry:${entry.id}`,
      kinds: ["empty_entry"],
      message: `No bullets were kept for "${entry.title}", so its original bullets are used.`,
      resolution: "kept_original",
    });
    return entry.bullets.map((bullet) => ({ bulletId: `bullet:${bullet.id}`, text: bullet.text }));
  }
  return bullets;
}
