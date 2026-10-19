import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { LATEX_SOURCE_MAX, addPdfTexGuards, checkLatexSource } from "@/lib/latex/source";

const MINIMAL = "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n";

// The two pdfTeX-only lines far apart, the way real templates have them.
const UNGUARDED = [
  "\\documentclass{article}",
  "\\usepackage{titlesec}",
  "\\input{glyphtounicode}",
  "",
  "\\usepackage[sfdefault]{roboto}",
  "\\addtolength{\\textwidth}{1in}",
  "% Ensure PDF is machine readable",
  "\\pdfgentounicode=1",
  "\\begin{document}",
  "Hi",
  "\\end{document}",
].join("\n");

describe("checkLatexSource", () => {
  it("accepts a compilable document", () => {
    expect(checkLatexSource(MINIMAL)).toEqual({ ok: true, source: MINIMAL });
  });

  it("rejects empty, oversized, binary, and body-less input", () => {
    expect(checkLatexSource("  \n").ok).toBe(false);
    expect(checkLatexSource(MINIMAL + "%".repeat(LATEX_SOURCE_MAX)).ok).toBe(false);
    expect(checkLatexSource("%PDF-1.7\u0000\u0001").ok).toBe(false);
    expect(checkLatexSource("\\documentclass{article}\nHi").ok).toBe(false);
  });
});

describe("addPdfTexGuards", () => {
  it("wraps each pdfTeX-only line in its own guard and loads iftex once", () => {
    const { source, changed } = addPdfTexGuards(UNGUARDED);
    expect(changed).toBe(true);
    expect(source).toBe(
      [
        "\\documentclass{article}",
        "\\usepackage{titlesec}",
        "\\usepackage{iftex}",
        "\\ifPDFTeX",
        "\\input{glyphtounicode}",
        "\\fi",
        "",
        // Lines between the two stay outside any guard.
        "\\usepackage[sfdefault]{roboto}",
        "\\addtolength{\\textwidth}{1in}",
        "% Ensure PDF is machine readable",
        "\\ifPDFTeX",
        "\\pdfgentounicode=1",
        "\\fi",
        "\\begin{document}",
        "Hi",
        "\\end{document}",
      ].join("\n"),
    );
  });

  it("is idempotent: guarding twice equals guarding once", () => {
    const once = addPdfTexGuards(UNGUARDED).source;
    expect(addPdfTexGuards(once)).toEqual({ source: once, changed: false });
  });

  it("keeps Windows line endings", () => {
    const { source } = addPdfTexGuards(UNGUARDED.replaceAll("\n", "\r\n"));
    expect(source.split("\r\n")).toHaveLength(16);
    expect(source.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("matches lines with trailing comments, but not commented-out lines", () => {
    const { source } = addPdfTexGuards(
      "\\pdfgentounicode=1 % make PDF readable\n% \\input{glyphtounicode}\n",
    );
    expect(source).toBe(
      "\\usepackage{iftex}\n\\ifPDFTeX\n\\pdfgentounicode=1 % make PDF readable\n\\fi\n% \\input{glyphtounicode}\n",
    );
  });

  it("leaves lines alone that share one existing guard block", () => {
    const shared = "\\ifPDFTeX\n  \\input{glyphtounicode}\n  \\pdfgentounicode=1\n\\fi\n";
    expect(addPdfTexGuards(shared)).toEqual({ source: shared, changed: false });
  });

  it("doesn't load iftex again if the file already does", () => {
    const { source } = addPdfTexGuards("\\usepackage{iftex}\n\\pdfgentounicode=1\n");
    expect(source.match(/iftex/g)).toHaveLength(1);
  });

  it("leaves a file with nothing to guard unchanged", () => {
    expect(addPdfTexGuards(MINIMAL)).toEqual({ source: MINIMAL, changed: false });
  });

  // The committed demo template is already guarded by hand.
  it("leaves the demo resume template unchanged", () => {
    const demo = fs.readFileSync(
      path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
      "utf8",
    );
    expect(checkLatexSource(demo).ok).toBe(true);
    expect(addPdfTexGuards(demo).changed).toBe(false);
  });
});
