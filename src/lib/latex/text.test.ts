import { describe, it, expect } from "vitest";
import { latexToPlain, plainToLatex } from "@/lib/latex/text";

describe("latexToPlain", () => {
  it("unescapes special characters", () => {
    expect(latexToPlain("Fennel \\& Finch, dropped below 1\\%, \\$5 \\#1 a\\_b")).toBe(
      "Fennel & Finch, dropped below 1%, $5 #1 a_b",
    );
  });

  it("keeps the text of formatting commands", () => {
    expect(latexToPlain("\\textbf{Languages}: \\emph{Type}\\textit{Script}")).toBe(
      "Languages: TypeScript",
    );
  });

  it("keeps only the link text of \\href", () => {
    expect(latexToPlain("\\href{mailto:a@example.com}{a@example.com}")).toBe("a@example.com");
  });

  it("converts dashes, quotes, ties, and control spaces", () => {
    expect(latexToPlain("2019 -- 2020, a --- b, ``hi'', Mr.~X, \\textbullet\\ Built")).toBe(
      "2019 – 2020, a — b, “hi”, Mr. X, • Built",
    );
  });

  it("drops math dollars, comments, and spacing commands", () => {
    expect(latexToPlain("a $|$ b % a comment\n\\vspace{-1pt}c")).toBe("a | b c");
  });

  it("keeps a typed en dash as is", () => {
    expect(latexToPlain("Nov 2021 – Feb 2022")).toBe("Nov 2021 – Feb 2022");
  });
});

describe("plainToLatex", () => {
  it("escapes every special character", () => {
    expect(plainToLatex("R&D 50% $5 #1 a_b {x} ~ ^ | < >")).toBe(
      "R\\&D 50\\% \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbar{} \\textless{} \\textgreater{}",
    );
  });

  // The injection defense: a command in model text can't run.
  it("turns LaTeX commands into printed text", () => {
    expect(plainToLatex("\\input{/etc/passwd}")).toBe(
      "\\textbackslash{}input\\{/etc/passwd\\}",
    );
  });

  it("collapses newlines so text can't start a new paragraph", () => {
    expect(plainToLatex("  line one\n\nline two  ")).toBe("line one line two");
  });

  it("writes en and em dashes as LaTeX dashes", () => {
    expect(plainToLatex("2019 – 2020 — done")).toBe("2019 -- 2020 --- done");
  });
});

describe("round trip", () => {
  // For the kinds of text resume bullets contain, plain -> LaTeX -> plain
  // gives back the same text.
  it.each([
    "Fennel & Finch",
    "Flaky-test rate dropped below 1%",
    "Cut time-to-interactive from 6s to 1.8s",
    "Rooms of several hundred to 1,000+ users",
    "Team's go-to debugger: fixed the hardest bugs",
    "2019 – 2020",
    "WordPress (custom plugin development)",
  ])("%s", (text) => {
    expect(latexToPlain(plainToLatex(text))).toBe(text);
  });
});
