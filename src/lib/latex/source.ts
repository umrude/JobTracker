// Pure checks and fixes for an uploaded LaTeX resume source. No I/O, so
// they're unit tested directly. See docs/tailored-resumes.md for how the
// LaTeX source fits into tailoring.

// Far more than any resume template needs (the demo one is about 6 KB),
// and small enough that a huge paste is caught early.
export const LATEX_SOURCE_MAX = 100_000;

export type LatexSourceCheck =
  | { ok: true; source: string }
  | { ok: false; message: string };

export function checkLatexSource(raw: string): LatexSourceCheck {
  if (raw.trim() === "") {
    return { ok: false, message: "The LaTeX file is empty." };
  }
  if (raw.length > LATEX_SOURCE_MAX) {
    return {
      ok: false,
      message: `The LaTeX file is over ${LATEX_SOURCE_MAX.toLocaleString("en-US")} characters, which is far larger than a resume template should be.`,
    };
  }
  // A NUL character means this isn't a text file (e.g. a renamed PDF).
  if (raw.includes("\u0000")) {
    return { ok: false, message: "That doesn't look like a LaTeX text file." };
  }
  if (!raw.includes("\\begin{document}") || !raw.includes("\\end{document}")) {
    return {
      ok: false,
      message: "That LaTeX file has no \\begin{document} ... \\end{document}, so it can't be compiled.",
    };
  }
  return { ok: true, source: raw };
}

// The pdfTeX-only lines common in resume templates. They make pdfLaTeX's
// output machine-readable for applicant tracking systems, but XeTeX
// (which Tectonic uses) doesn't define them and fails to compile. XeTeX's
// output is already machine-readable, so they're only needed under pdfTeX.
const PDFTEX_ONLY_LINES = new Set(["\\input{glyphtounicode}", "\\pdfgentounicode=1"]);

// A line's code without a trailing comment. `%` starts a comment unless
// escaped as `\%`.
function codeOf(line: string): string {
  return line.replace(/(?<!\\)%.*$/, "").trim();
}

// Wraps each pdfTeX-only line in its own \ifPDFTeX ... \fi, and loads the
// iftex package that defines \ifPDFTeX. Each line gets its own guard
// because in real templates they can be far apart, and one big block
// would hide everything between them (fonts, margins) from XeTeX.
//
// Idempotent: lines that are already guarded are left alone, so running
// it on its own output changes nothing. Keeps the file's line endings.
export function addPdfTexGuards(source: string): { source: string; changed: boolean } {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(eol);
  const hasIftex = lines.some((line) => /\\usepackage(\[[^\]]*\])?\{[^}]*\biftex\b[^}]*\}/.test(codeOf(line)));

  const result: string[] = [];
  let changed = false;
  let addedIftex = hasIftex;
  // Whether we're inside an existing \ifPDFTeX ... \fi block, so lines a
  // template already guards (one at a time or together) are left alone.
  let inPdfTexBlock = false;

  for (const line of lines) {
    const code = codeOf(line);
    if (code === "\\ifPDFTeX") inPdfTexBlock = true;
    else if (code === "\\fi") inPdfTexBlock = false;

    if (!PDFTEX_ONLY_LINES.has(code) || inPdfTexBlock) {
      result.push(line);
      continue;
    }

    if (!addedIftex) {
      result.push("\\usepackage{iftex}");
      addedIftex = true;
    }
    result.push("\\ifPDFTeX", line, "\\fi");
    changed = true;
  }

  return { source: result.join(eol), changed };
}
