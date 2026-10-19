import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { applyResumeEdits, parseResumeLatex, type ParsedResumeLatex } from "@/lib/latex/resume";

const DEMO = fs.readFileSync(
  path.join(process.cwd(), "src/server/db/fixtures/demo-resume.tex"),
  "utf8",
);

function parse(tex: string): ParsedResumeLatex {
  const result = parseResumeLatex(tex);
  if (!result.ok) throw new Error(result.message);
  return result.resume;
}

function apply(tex: string, edits: Parameters<typeof applyResumeEdits>[1]): string {
  const result = applyResumeEdits(tex, edits);
  if (!result.ok) throw new Error(result.message);
  return result.tex;
}

// A snippet with the quirks seen in real templates: Windows line endings,
// a space between heading arguments, a typed en dash, formatting inside a
// bullet, a comment that mentions \resumeItem, and an entry with no bullets.
const QUIRKY = [
  "\\documentclass{article}",
  "\\newcommand{\\resumeSubHeadingList}{\\begin{itemize}}",
  "\\begin{document}",
  "\\section{Experience}",
  "\\resumeSubHeadingList",
  "  \\resumeSubheading",
  "      {Project Evaluator (Contract)}{Nov 2021 – Feb 2022}",
  "      {Lighthouse Labs} {Vancouver, BC}",
  "      \\resumeSubHeadingList",
  "          % \\resumeItem{\\textbullet\\ commented out}",
  "          \\resumeItem{\\textbullet\\ Mentored students on \\textbf{React}}",
  "          \\resumeItem{\\textbullet\\ Reviewed projects \\& gave feedback}",
  "      \\resumeSubHeadingListEnd",
  "\\resumeSubHeadingListEnd",
  "\\section{Education}",
  "\\resumeSubHeadingList",
  "  \\resumeSubheading",
  "      {Lighthouse Labs} {Vancouver BC}",
  "      {Diploma in Web Development}{Sept 2019 -- Dec 2019}",
  "\\resumeSubHeadingListEnd",
  "\\end{document}",
].join("\r\n");

describe("parseResumeLatex on the demo resume", () => {
  const resume = parse(DEMO);

  it("reads the summary as plain text", () => {
    expect(resume.summary?.text).toMatch(/^Frontend engineer with 6 years/);
    expect(resume.summary?.text).toMatch(/interfaces that work for everyone\.$/);
  });

  it("reads each skill category and its items", () => {
    expect(resume.skills.map((s) => s.category)).toEqual([
      "Languages",
      "Frontend",
      "Real-time",
      "Testing",
      "Tools",
    ]);
    expect(resume.skills[4].items.map((i) => i.text)).toEqual([
      "Git",
      "GitHub Actions",
      "Vercel",
      "Figma (handoff only)",
    ]);
  });

  it("reads entries per section, with ids across the whole document", () => {
    expect(resume.sections.map((s) => [s.title, s.entries.map((e) => e.id)])).toEqual([
      ["Notable Projects", ["e1", "e2"]],
      ["Experience", ["e3", "e4", "e5"]],
      ["Education", ["e6"]],
    ]);
  });

  it("reads headings and bullets as plain text", () => {
    const junior = resume.sections[1].entries[2];
    expect(junior.heading).toEqual([
      "Junior Web Developer",
      "2019 – 2020",
      "Fennel & Finch Agency",
      "Portland, OR",
    ]);
    const larkspur = resume.sections[1].entries[0];
    expect(larkspur.bullets.map((b) => b.id)).toEqual(["e3.b1", "e3.b2", "e3.b3"]);
    expect(larkspur.bullets[0].text).toBe(
      "Introduced Playwright end-to-end tests and component tests in CI (GitHub Actions); flaky-test rate dropped below 1%",
    );
    expect(larkspur.bulletPrefix).toBe("\\textbullet\\ ");
  });

  it("treats an entry without a list as having no bullets", () => {
    expect(resume.sections[2].entries[0].bullets).toEqual([]);
  });
});

describe("parseResumeLatex on template quirks", () => {
  const resume = parse(QUIRKY);
  const [evaluator] = resume.sections[0].entries;

  it("handles a space between heading arguments and a typed en dash", () => {
    expect(evaluator.heading).toEqual([
      "Project Evaluator (Contract)",
      "Nov 2021 – Feb 2022",
      "Lighthouse Labs",
      "Vancouver, BC",
    ]);
  });

  it("ignores commented-out bullets and keeps formatting out of the text", () => {
    expect(evaluator.bullets.map((b) => b.text)).toEqual([
      "Mentored students on React",
      "Reviewed projects & gave feedback",
    ]);
  });

  it("rejects a file that isn't a supported template", () => {
    const result = parseResumeLatex("\\begin{document}\nJust a paragraph.\n\\end{document}");
    expect(result.ok).toBe(false);
  });
});

describe("applyResumeEdits", () => {
  it("returns the file unchanged when there are no edits", () => {
    expect(apply(DEMO, {})).toBe(DEMO);
  });

  it("rewrites the summary, escaping special characters", () => {
    const tex = apply(DEMO, { summary: "Frontend engineer focused on R&D tooling, 100% tested." });
    expect(tex).toContain(
      "\\section*{Summary}\nFrontend engineer focused on R\\&D tooling, 100\\% tested.\n\n\\section{Technical Skills}",
    );
  });

  it("reorders bullets, keeping each bullet's original LaTeX", () => {
    const resume = parse(DEMO);
    const larkspur = resume.sections[1].entries[0];
    const [b1, b2, b3] = larkspur.bullets;
    const tex = apply(DEMO, { entries: [{ entryId: "e3", bullets: [b3.text, b1.text] }] });

    // b1 still has its original \% escape and \textbullet prefix.
    expect(tex).toContain(
      `          \\resumeItem{${b3.raw}}\n          \\resumeItem{${b1.raw}}\n      \\resumeSubHeadingListEnd`,
    );
    expect(tex).not.toContain(b2.raw);
  });

  it("escapes reworded bullets and gives them the entry's prefix", () => {
    const tex = apply(DEMO, {
      entries: [{ entryId: "e5", bullets: ["Built sites for R&D teams with HTML & CSS"] }],
    });
    expect(tex).toContain(
      "\\resumeItem{\\textbullet\\ Built sites for R\\&D teams with HTML \\& CSS}",
    );
  });

  it("reorders skill categories and items", () => {
    const tex = apply(DEMO, {
      skills: [
        { categoryId: "s4", items: ["axe-core", "Playwright"] },
        { categoryId: "s2", items: ["Next.js", "React"] },
      ],
    });
    expect(tex).toContain(
      "\\resumeSubHeadingList\n  \\resumeItem{\\textbf{Testing}: axe-core, Playwright}\n  \\resumeItem{\\textbf{Frontend}: Next.js, React}\n\\resumeSubHeadingListEnd",
    );
    expect(tex).not.toContain("\\textbf{Languages}");
  });

  it("never touches anything outside the edited parts", () => {
    const tex = apply(DEMO, {
      summary: "New summary.",
      skills: [{ categoryId: "s1", items: ["TypeScript"] }],
      entries: [{ entryId: "e1", bullets: ["One bullet"] }],
    });
    const header = DEMO.slice(0, DEMO.indexOf("\\section*{Summary}"));
    const fromExperience = DEMO.slice(DEMO.indexOf("\\section{Experience}"));
    expect(tex.startsWith(header)).toBe(true);
    expect(tex.endsWith(fromExperience)).toBe(true);
  });

  it("keeps Windows line endings when writing new lines", () => {
    const tex = apply(QUIRKY, { entries: [{ entryId: "e1", bullets: ["First", "Second"] }] });
    expect(tex).toContain(
      "\\resumeItem{\\textbullet\\ First}\r\n          \\resumeItem{\\textbullet\\ Second}\r\n",
    );
    expect(tex.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("is applied to the original text, so ids stay valid after a reorder", () => {
    // Editing an entry that comes after another edited entry still works,
    // because replacements are applied from the end of the file backwards.
    const tex = apply(DEMO, {
      entries: [
        { entryId: "e1", bullets: ["Project bullet"] },
        { entryId: "e4", bullets: ["Copperline bullet"] },
      ],
    });
    expect(parse(tex).sections[0].entries[0].bullets.map((b) => b.text)).toEqual(["Project bullet"]);
    expect(parse(tex).sections[1].entries[1].bullets.map((b) => b.text)).toEqual(["Copperline bullet"]);
  });

  it("rejects unknown ids, entries without bullets, and duplicate edits", () => {
    expect(applyResumeEdits(DEMO, { entries: [{ entryId: "e99", bullets: ["x"] }] }).ok).toBe(false);
    expect(applyResumeEdits(DEMO, { entries: [{ entryId: "e6", bullets: ["x"] }] }).ok).toBe(false);
    expect(applyResumeEdits(DEMO, { skills: [{ categoryId: "s99", items: ["x"] }] }).ok).toBe(false);
    expect(
      applyResumeEdits(DEMO, {
        entries: [
          { entryId: "e1", bullets: ["x"] },
          { entryId: "e1", bullets: ["y"] },
        ],
      }).ok,
    ).toBe(false);
  });
});
