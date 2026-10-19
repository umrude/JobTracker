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
import type { ResumeEdits } from "@/lib/schemas/resume-edits";

// Reads a LaTeX resume into its editable parts, and writes edits back.
//
// It understands the "Jake's Resume" family of templates (the demo resume
// and the owner's resume both use it):
//   \section*{Summary}       a plain paragraph
//   \section{... Skills}     \resumeItem{\textbf{Category}: a, b, c}
//   any other \section       \resumeSubheading{4 args}, optionally followed by
//                            \resumeSubHeadingList \resumeItem{...} ... \resumeSubHeadingListEnd
//
// Everything outside those editable parts (the header, entry headings,
// dates, education) is never rewritten: applyResumeEdits only replaces the
// exact character ranges recorded here. See docs/tailored-resumes.md.

type Span = { start: number; end: number };

export type Bullet = Span & {
  id: string;
  // The original LaTeX inside \resumeItem{...}, including any prefix.
  raw: string;
  // What a person reads, without the prefix.
  text: string;
};

export type ResumeEntry = {
  id: string;
  // The four \resumeSubheading arguments as plain text, e.g.
  // [title, dates, organization, location].
  heading: [string, string, string, string];
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

export type ResumeSection = { title: string; entries: ResumeEntry[] };

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
      if (entries.length > 0) resume.sections.push({ title: section.title, entries });
    }
  }

  const hasBullets = resume.sections.some((s) => s.entries.some((e) => e.bullets.length > 0));
  if (!resume.summary && resume.skills.length === 0 && !hasBullets) {
    return { ok: false, message: UNSUPPORTED };
  }
  return { ok: true, resume };
}

type SectionBounds = { title: string; bodyStart: number; end: number };

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
    if (groups.length < 4) {
      position = cursor;
      continue;
    }

    const id = `e${idOffset + entries.length + 1}`;
    const bullets: Bullet[] = [];
    let bulletPrefix = "";

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
      cursor = bulletsEnd === section.end ? bulletsEnd : bulletsEnd + 1;
    }

    const heading = groups.map((group) => latexToPlain(contentOf(tex, group)));
    entries.push({
      id,
      heading: [heading[0], heading[1], heading[2], heading[3]],
      bullets,
      bulletPrefix,
    });
    position = cursor;
  }
  return entries;
}

type Replacement = Span & { text: string };

// Applies plain-text edits to the LaTeX source. Items whose text is
// unchanged are written back from their original LaTeX, so their exact
// formatting survives; new or reworded text is escaped with plainToLatex.
// Only the summary, skills block, and edited entries' bullet lists change;
// every other character of the file is kept.
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

  const entries = new Map(resume.sections.flatMap((section) => section.entries.map((e) => [e.id, e])));
  const editedEntries = new Set<string>();
  for (const { entryId, bullets } of edits.entries ?? []) {
    const entry = entries.get(entryId);
    if (!entry) return { ok: false, message: `Unknown entry "${entryId}".` };
    if (editedEntries.has(entryId)) return { ok: false, message: `Entry "${entryId}" is edited twice.` };
    editedEntries.add(entryId);

    const first = entry.bullets[0];
    const last = entry.bullets[entry.bullets.length - 1];
    if (!first || !last) return { ok: false, message: `Entry "${entryId}" has no bullet list to edit.` };

    const rawByText = new Map(entry.bullets.map((bullet) => [bullet.text, bullet.raw]));
    const lines = bullets.map(
      (text) => `\\resumeItem{${rawByText.get(text) ?? entry.bulletPrefix + plainToLatex(text)}}`,
    );
    replacements.push({
      start: first.start,
      end: last.end,
      text: lines.join(eol + indentationAt(tex, first.start)),
    });
  }

  // Apply from the end of the file backwards, so earlier offsets stay valid.
  let result = tex;
  for (const { start, end, text } of replacements.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + text + result.slice(end);
  }
  return { ok: true, tex: result };
}
