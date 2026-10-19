// Low-level helpers for reading LaTeX source: finding commands and their
// {brace groups} while skipping comments and escaped characters. They
// understand just enough LaTeX for resume templates, not the full language.
// See docs/tailored-resumes.md (Step 2) for why a small scanner instead of
// regexes or a full LaTeX parser.

export type Group = {
  // Index of the opening "{".
  start: number;
  contentStart: number;
  // Index of the matching "}".
  contentEnd: number;
  // Index just after the matching "}".
  end: number;
};

// Skips whitespace and % comments, returning the next meaningful index.
export function skipSpace(tex: string, from: number): number {
  let i = from;
  while (i < tex.length) {
    const ch = tex.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "%") {
      const newline = tex.indexOf("\n", i);
      i = newline === -1 ? tex.length : newline + 1;
    } else {
      break;
    }
  }
  return i;
}

// Reads the {group} starting at the next meaningful character after
// `from`. Returns null if there isn't one or it's never closed. Nested
// braces are counted; escaped braces (\{ \}) and comments are skipped.
export function readGroup(tex: string, from: number): Group | null {
  const start = skipSpace(tex, from);
  if (tex.charAt(start) !== "{") return null;

  let depth = 0;
  for (let i = start; i < tex.length; i++) {
    const ch = tex.charAt(i);
    if (ch === "\\") {
      i++; // Skip the escaped character, e.g. \{ or \%.
    } else if (ch === "%") {
      const newline = tex.indexOf("\n", i);
      if (newline === -1) return null;
      i = newline;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { start, contentStart: start + 1, contentEnd: i, end: i + 1 };
      }
    }
  }
  return null;
}

// Whether `\name` starts at index i as a whole command: `\resumeItem`
// doesn't match `\resumeItemList`, and `\resumeSubHeadingList` doesn't
// match `\resumeSubHeadingListEnd`.
export function isCommandAt(tex: string, i: number, name: string): boolean {
  if (!tex.startsWith(`\\${name}`, i)) return false;
  return !/[A-Za-z@]/.test(tex.charAt(i + name.length + 1));
}

// Index of the next `\name` in [from, to), ignoring comments, or -1.
export function findCommand(
  tex: string,
  name: string,
  from = 0,
  to = tex.length,
): number {
  for (let i = from; i < to; i++) {
    const ch = tex.charAt(i);
    if (ch === "%") {
      const newline = tex.indexOf("\n", i);
      if (newline === -1) return -1;
      i = newline;
    } else if (ch === "\\") {
      if (isCommandAt(tex, i, name)) return i;
      i++; // Skip the next character so \\ and \% aren't misread.
    }
  }
  return -1;
}

// Every `\name` in [from, to), in order.
export function findAllCommands(
  tex: string,
  name: string,
  from = 0,
  to = tex.length,
): number[] {
  const found: number[] = [];
  let i = findCommand(tex, name, from, to);
  while (i !== -1) {
    found.push(i);
    i = findCommand(tex, name, i + name.length + 1, to);
  }
  return found;
}

// The whitespace before index i on its line, or "" if there's anything
// else before it on that line.
export function indentationAt(tex: string, i: number): string {
  const lineStart = tex.lastIndexOf("\n", i - 1) + 1;
  const before = tex.slice(lineStart, i);
  return /^[ \t]*$/.test(before) ? before : "";
}
