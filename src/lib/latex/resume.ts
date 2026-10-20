import {
  findAllCommands,
  findCommand,
  indentationAt,
  isCommandAt,
  readGroup,
  skipSpace,
  type Group,
} from "@/lib/latex/scan";
import { latexToPlain, plainToLatex } from "@/lib/latex/text";
import type { EntryEdit, ResumeEdits } from "@/lib/schemas/resume-edits";

// Reads a LaTeX resume into its editable parts, and writes edits back.
//
// It understands the "Jake's Resume" family of templates (the demo resume
// and the owner's resume both use it):
//   \section*{Summary}       a plain paragraph
//   \section{... Skills}     \resumeItem{\textbf{Category}: a, b, c}
//   any other \section       \resumeSubheading{4 args}, optionally followed by
//                            \resumeSubHeadingList \resumeItem{...} ... \resumeSubHeadingListEnd
//
// Everything outside the edited parts (the header, existing entry headings,
// dates, unedited sections) is never rewritten: applyResumeEdits only
// replaces the exact character ranges recorded here. New entries and
// sections are built by copying an existing one as a template, so they're
// formatted exactly like the rest of the file. See docs/tailored-resumes.md.

type Span = { start: number; end: number };

export type Bullet = Span & {
  id: string;
  // The original LaTeX inside \resumeItem{...}, including any prefix.
  raw: string;
  // What a person reads, without the prefix.
  text: string;
};

// An entry's whole block runs from \resumeSubheading to the end of its
// bullet list (or of its heading, if it has no list): `start`..`end`.
export type ResumeEntry = Span & {
  id: string;
  // The four \resumeSubheading arguments as plain text, e.g.
  // [title, dates, organization, location].
  heading: [string, string, string, string];
  // Where each heading argument's {group} is, for templating new entries.
  headingGroups: [Group, Group, Group, Group];
  bullets: Bullet[];
  // Written before new bullets' text, e.g. "\textbullet\ ", copied from the
  // entry's first bullet so new ones look like the rest.
  bulletPrefix: string;
};

export type SkillItem = { raw: string; text: string };

export type SkillCategory = Span & {
  id: string;
  categoryRaw: string;
  category: string;
  items: SkillItem[];
};

// A section with entries runs from \section to the next section (or
// \end{document}): `start`..`end`.
export type ResumeSection = Span & {
  title: string;
  titleGroup: Group;
  entries: ResumeEntry[];
};

export type ParsedResumeLatex = {
  summary: (Span & { text: string }) | null;
  skills: SkillCategory[];
  sections: ResumeSection[];
};

export type LatexResult<T> = ({ ok: true } & T) | { ok: false; message: string };

const UNSUPPORTED =
  "This LaTeX doesn't follow a supported resume template, so it can't be tailored. Supported templates use \\resumeSubheading entries with \\resumeItem bullets.";

export function parseResumeLatex(tex: string): LatexResult<{ resume: ParsedResumeLatex }> {
  // The preamble's \newcommand definitions contain \begin{tabular*} and
  // \begin{itemize}, so look for \begin{document} specifically.
  const bodyStart = tex.indexOf("\\begin{document}");
  const documentEnd = tex.lastIndexOf("\\end{document}");
  if (bodyStart === -1 || documentEnd === -1) return { ok: false, message: UNSUPPORTED };

  const resume: ParsedResumeLatex = { summary: null, skills: [], sections: [] };
  let entryCount = 0;

  for (const section of findSections(tex, bodyStart, documentEnd)) {
    const title = section.title.toLowerCase();
    if (title.includes("summary") && !resume.summary) {
      resume.summary = parseSummary(tex, section);
    } else if (title.includes("skill") && resume.skills.length === 0) {
      resume.skills = parseSkills(tex, section);
    } else {
      const entries = parseEntries(tex, section, entryCount);
      entryCount += entries.length;
      if (entries.length > 0) {
        resume.sections.push({
          title: section.title,
          titleGroup: section.titleGroup,
          start: section.start,
          end: section.end,
          entries,
        });
      }
    }
  }

  const hasBullets = resume.sections.some((s) => s.entries.some((e) => e.bullets.length > 0));
  if (!resume.summary && resume.skills.length === 0 && !hasBullets) {
    return { ok: false, message: UNSUPPORTED };
  }
  return { ok: true, resume };
}

type SectionBounds = Span & { title: string; titleGroup: Group; bodyStart: number };

function findSections(tex: string, from: number, to: number): SectionBounds[] {
  const starts = findAllCommands(tex, "section", from, to);
  const sections: SectionBounds[] = [];
  for (const [index, start] of starts.entries()) {
    let i = start + "\\section".length;
    if (tex.charAt(i) === "*") i++;
    const titleGroup = readGroup(tex, i);
    if (!titleGroup) continue;
    sections.push({
      title: latexToPlain(contentOf(tex, titleGroup)),
      titleGroup,
      start,
      bodyStart: titleGroup.end,
      end: starts[index + 1] ?? to,
    });
  }
  return sections;
}

function contentOf(tex: string, group: Group): string {
  return tex.slice(group.contentStart, group.contentEnd);
}

// The summary is the plain paragraph between the heading and the next
// section. If the section contains lists or environments, it isn't a
// plain paragraph and isn't treated as editable.
function parseSummary(tex: string, section: SectionBounds): ParsedResumeLatex["summary"] {
  const body = tex.slice(section.bodyStart, section.end);
  if (body.includes("\\begin") || body.includes("\\resumeSubHeadingList") || body.includes("\\resumeItem")) {
    return null;
  }
  const start = skipSpace(tex, section.bodyStart);
  let end = section.end;
  while (end > start && /\s/.test(tex.charAt(end - 1))) end--;
  if (end <= start) return null;
  return { start, end, text: latexToPlain(tex.slice(start, end)) };
}

// Each skill line is \resumeItem{\textbf{Category}: a, b, c}. If any line
// doesn't fit that shape, the skills aren't treated as editable (rather
// than guessing and rewriting something we don't understand).
function parseSkills(tex: string, section: SectionBounds): SkillCategory[] {
  const categories: SkillCategory[] = [];
  for (const start of findAllCommands(tex, "resumeItem", section.bodyStart, section.end)) {
    const group = readGroup(tex, start + "\\resumeItem".length);
    if (!group) return [];

    const inner = contentOf(tex, group);
    const boldAt = skipSpace(inner, 0);
    if (!isCommandAt(inner, boldAt, "textbf")) return [];
    const categoryGroup = readGroup(inner, boldAt + "\\textbf".length);
    if (!categoryGroup) return [];
    const colonAt = skipSpace(inner, categoryGroup.end);
    if (inner.charAt(colonAt) !== ":") return [];

    const items = splitTopLevelCommas(inner.slice(colonAt + 1))
      .map((raw) => raw.trim())
      .filter((raw) => raw !== "")
      .map((raw) => ({ raw, text: latexToPlain(raw) }));
    const categoryRaw = contentOf(inner, categoryGroup);

    categories.push({
      id: `s${categories.length + 1}`,
      start,
      end: group.end,
      categoryRaw,
      category: latexToPlain(categoryRaw),
      items,
    });
  }
  return categories;
}

// Splits "React, Vue.js, WordPress (custom, plugins)" on commas that aren't
// inside (parentheses) or {braces}.
function splitTopLevelCommas(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < list.length; i++) {
    const ch = list.charAt(i);
    if (ch === "\\") {
      current += ch + list.charAt(i + 1);
      i++;
      continue;
    }
    if (ch === "(" || ch === "{") depth++;
    if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

const BULLET_PREFIX = /^\s*\\textbullet\\ /;
const LIST_END = "\\resumeSubHeadingListEnd";

function parseEntries(tex: string, section: SectionBounds, idOffset: number): ResumeEntry[] {
  const entries: ResumeEntry[] = [];
  let position = section.bodyStart;

  for (;;) {
    const start = findCommand(tex, "resumeSubheading", position, section.end);
    if (start === -1) break;

    const groups: Group[] = [];
    let cursor = start + "\\resumeSubheading".length;
    for (let n = 0; n < 4; n++) {
      const group = readGroup(tex, cursor);
      if (!group) break;
      groups.push(group);
      cursor = group.end;
    }
    const [g0, g1, g2, g3] = groups;
    if (!g0 || !g1 || !g2 || !g3) {
      position = cursor;
      continue;
    }

    const id = `e${idOffset + entries.length + 1}`;
    const bullets: Bullet[] = [];
    let bulletPrefix = "";
    let end = g3.end;

    // A nested \resumeSubHeadingList right after the heading holds the
    // entry's bullets.
    const afterHeading = skipSpace(tex, cursor);
    if (isCommandAt(tex, afterHeading, "resumeSubHeadingList")) {
      const listStart = afterHeading + "\\resumeSubHeadingList".length;
      const listEnd = findCommand(tex, "resumeSubHeadingListEnd", listStart, section.end);
      const bulletsEnd = listEnd === -1 ? section.end : listEnd;

      for (const bulletStart of findAllCommands(tex, "resumeItem", listStart, bulletsEnd)) {
        const group = readGroup(tex, bulletStart + "\\resumeItem".length);
        if (!group) continue;
        const raw = contentOf(tex, group);
        const prefix = BULLET_PREFIX.exec(raw)?.[0] ?? "";
        if (bullets.length === 0) bulletPrefix = prefix.trimStart();
        bullets.push({
          id: `${id}.b${bullets.length + 1}`,
          start: bulletStart,
          end: group.end,
          raw,
          text: latexToPlain(raw.slice(prefix.length)),
        });
      }
      end = listEnd === -1 ? section.end : listEnd + LIST_END.length;
      cursor = end;
    }

    entries.push({
      id,
      start,
      end,
      heading: [
        latexToPlain(contentOf(tex, g0)),
        latexToPlain(contentOf(tex, g1)),
        latexToPlain(contentOf(tex, g2)),
        latexToPlain(contentOf(tex, g3)),
      ],
      headingGroups: [g0, g1, g2, g3],
      bullets,
      bulletPrefix,
    });
    position = cursor;
  }
  return entries;
}

type Replacement = Span & { text: string };

// Replaces ranges of `text` (positions relative to it), applied from the
// end backwards so earlier positions stay valid.
function replaceAll(text: string, replacements: Replacement[]): string {
  let result = text;
  for (const { start, end, text: value } of [...replacements].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + value + result.slice(end);
  }
  return result;
}

// The bullet lines for an entry. Bullets whose text matches an original
// keep their original LaTeX; new or reworded text is escaped.
function bulletLines(source: ResumeEntry, bullets: readonly string[], prefix: string): string[] {
  const rawByText = new Map(source.bullets.map((bullet) => [bullet.text, bullet.raw]));
  return bullets.map((text) => `\\resumeItem{${rawByText.get(text) ?? prefix + plainToLatex(text)}}`);
}

// Applies plain-text edits to the LaTeX source. Items whose text is
// unchanged are written back from their original LaTeX, so their exact
// formatting survives; new or reworded text is escaped with plainToLatex.
// Only the edited parts change; every other character of the file is kept.
export function applyResumeEdits(tex: string, edits: ResumeEdits): LatexResult<{ tex: string }> {
  const parsed = parseResumeLatex(tex);
  if (!parsed.ok) return parsed;
  const { resume } = parsed;
  const eol = tex.includes("\r\n") ? "\r\n" : "\n";
  const replacements: Replacement[] = [];

  if (edits.summary !== undefined) {
    if (!resume.summary) return { ok: false, message: "This resume has no editable summary." };
    replacements.push({ ...resume.summary, text: plainToLatex(edits.summary) });
  }

  if (edits.skills) {
    const first = resume.skills[0];
    const last = resume.skills[resume.skills.length - 1];
    if (!first || !last) return { ok: false, message: "This resume has no editable skills." };

    const categories = new Map(resume.skills.map((category) => [category.id, category]));
    const rawByText = new Map(
      resume.skills.flatMap((category) => category.items.map((item) => [item.text, item.raw])),
    );
    const lines: string[] = [];
    for (const { categoryId, items } of edits.skills) {
      const category = categories.get(categoryId);
      if (!category) return { ok: false, message: `Unknown skill category "${categoryId}".` };
      const itemsLatex = items.map((item) => rawByText.get(item) ?? plainToLatex(item));
      lines.push(`\\resumeItem{\\textbf{${category.categoryRaw}}: ${itemsLatex.join(", ")}}`);
    }
    replacements.push({
      start: first.start,
      end: last.end,
      text: lines.join(eol + indentationAt(tex, first.start)),
    });
  }

  const allEntries = resume.sections.flatMap((section) => section.entries);
  const entries = new Map(allEntries.map((entry) => [entry.id, entry]));
  // Each existing entry can be touched by at most one edit.
  const usedEntries = new Set<string>();
  const claim = (entryId: string): LatexResult<{ entry: ResumeEntry }> => {
    const entry = entries.get(entryId);
    if (!entry) return { ok: false, message: `Unknown entry "${entryId}".` };
    if (usedEntries.has(entryId)) return { ok: false, message: `Entry "${entryId}" is edited twice.` };
    usedEntries.add(entryId);
    return { ok: true, entry };
  };

  // Bullet-only edits on entries that stay where they are.
  for (const { entryId, bullets } of edits.entries ?? []) {
    const claimed = claim(entryId);
    if (!claimed.ok) return claimed;
    const { entry } = claimed;

    const first = entry.bullets[0];
    const last = entry.bullets[entry.bullets.length - 1];
    if (!first || !last) return { ok: false, message: `Entry "${entryId}" has no bullet list to edit.` };
    replacements.push({
      start: first.start,
      end: last.end,
      text: bulletLines(entry, bullets, entry.bulletPrefix).join(eol + indentationAt(tex, first.start)),
    });
  }

  // Section edits: which entries a section holds, in what order, including
  // new entries from the profile, and whole new sections.
  if (edits.sections && edits.sections.length > 0) {
    // New entries and sections copy an existing one as a template, so they
    // look exactly like the rest of the file.
    const sampleEntry = allEntries.find((entry) => entry.bullets.length > 0) ?? allEntries[0];
    const sampleSection = resume.sections[0];
    if (!sampleEntry || !sampleSection) {
      return { ok: false, message: "This resume has no entries to use as a template." };
    }

    const buildEntry = (edit: EntryEdit): LatexResult<{ text: string }> => {
      if ("entryId" in edit) {
        const claimed = claim(edit.entryId);
        if (!claimed.ok) return claimed;
        const { entry } = claimed;
        const block = tex.slice(entry.start, entry.end);
        if (edit.bullets === undefined) return { ok: true, text: block };

        const first = entry.bullets[0];
        const last = entry.bullets[entry.bullets.length - 1];
        if (!first || !last) {
          return edit.bullets.length === 0
            ? { ok: true, text: block }
            : { ok: false, message: `Entry "${edit.entryId}" has no bullet list to edit.` };
        }
        const lines = bulletLines(entry, edit.bullets, entry.bulletPrefix);
        return {
          ok: true,
          text: replaceAll(block, [
            {
              start: first.start - entry.start,
              end: last.end - entry.start,
              text: lines.join(eol + indentationAt(tex, first.start)),
            },
          ]),
        };
      }
      return { ok: true, text: newEntryBlock(tex, sampleEntry, edit.heading, edit.bullets, eol) };
    };

    const buildEntries = (list: readonly EntryEdit[], separator: string): LatexResult<{ text: string }> => {
      const blocks: string[] = [];
      for (const edit of list) {
        const built = buildEntry(edit);
        if (!built.ok) return built;
        blocks.push(built.text);
      }
      return { ok: true, text: blocks.join(separator) };
    };

    const sectionsByTitle = new Map(resume.sections.map((section) => [section.title.toLowerCase(), section]));
    const editedSections = new Set<string>();
    // New sections, grouped by where they're inserted, in the order given.
    const inserts = new Map<number, string[]>();

    for (const edit of edits.sections) {
      if ("title" in edit) {
        const section = sectionsByTitle.get(edit.title.toLowerCase());
        if (!section) return { ok: false, message: `Unknown section "${edit.title}".` };
        if (editedSections.has(section.title)) {
          return { ok: false, message: `Section "${edit.title}" is edited twice.` };
        }
        editedSections.add(section.title);

        const first = section.entries[0];
        const last = section.entries[section.entries.length - 1];
        if (!first || !last) return { ok: false, message: `Section "${edit.title}" has no entries.` };
        const built = buildEntries(edit.entries, entrySeparator(tex, section, eol));
        if (!built.ok) return built;
        replacements.push({ start: first.start, end: last.end, text: built.text });
        continue;
      }

      if (sectionsByTitle.has(edit.newTitle.toLowerCase())) {
        return { ok: false, message: `A section called "${edit.newTitle}" already exists.` };
      }
      let at: number;
      if (edit.afterSection === null) {
        const lastSection = resume.sections[resume.sections.length - 1];
        at = lastSection ? lastSection.end : sampleSection.end;
      } else {
        const after = sectionsByTitle.get(edit.afterSection.toLowerCase());
        if (!after) return { ok: false, message: `Unknown section "${edit.afterSection}".` };
        at = after.end;
      }
      const built = buildEntries(edit.entries, entrySeparator(tex, sampleSection, eol));
      if (!built.ok) return built;
      inserts.set(at, [...(inserts.get(at) ?? []), newSectionBlock(tex, sampleSection, edit.newTitle, built.text)]);
    }

    for (const [at, blocks] of inserts) {
      replacements.push({ start: at, end: at, text: blocks.join("") });
    }
  }

  return { ok: true, tex: replaceAll(tex, replacements) };
}

// What goes between two entries in a section: copied from the section if
// it has two entries, otherwise a line break plus the entry's indentation.
function entrySeparator(tex: string, section: ResumeSection, eol: string): string {
  const [first, second] = section.entries;
  if (first && second) return tex.slice(first.end, second.start);
  return first ? eol + indentationAt(tex, first.start) : eol;
}

// A new entry, built from an existing one as a template: same layout and
// spacing, with the heading arguments and bullets replaced (all escaped).
// An entry with no bullets gets no list, like an education entry.
function newEntryBlock(
  tex: string,
  sample: ResumeEntry,
  heading: readonly [string, string, string, string],
  bullets: readonly string[],
  eol: string,
): string {
  const first = sample.bullets[0];
  const last = sample.bullets[sample.bullets.length - 1];
  const end = bullets.length > 0 || !first ? sample.end : sample.headingGroups[3].end;
  const block = tex.slice(sample.start, end);

  const replacements: Replacement[] = sample.headingGroups.map((group, index) => ({
    start: group.contentStart - sample.start,
    end: group.contentEnd - sample.start,
    text: plainToLatex(heading[index] ?? ""),
  }));
  if (bullets.length > 0 && first && last) {
    const lines = bullets.map((text) => `\\resumeItem{${sample.bulletPrefix}${plainToLatex(text)}}`);
    replacements.push({
      start: first.start - sample.start,
      end: last.end - sample.start,
      text: lines.join(eol + indentationAt(tex, first.start)),
    });
  }
  return replaceAll(block, replacements);
}

// A new section, built from an existing one as a template: the same
// heading and list markup, with the title replaced and the given entries
// inside. Includes the template's trailing spacing, so it slots in before
// the next section like the others.
function newSectionBlock(tex: string, sample: ResumeSection, title: string, entriesText: string): string {
  const first = sample.entries[0];
  const last = sample.entries[sample.entries.length - 1];
  if (!first || !last) return "";
  const head = replaceAll(tex.slice(sample.start, first.start), [
    {
      start: sample.titleGroup.contentStart - sample.start,
      end: sample.titleGroup.contentEnd - sample.start,
      text: plainToLatex(title),
    },
  ]);
  return head + entriesText + tex.slice(last.end, sample.end);
}
