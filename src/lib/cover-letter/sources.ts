import { readGroup } from "@/lib/latex/scan";
import type { ParsedResumeLatex } from "@/lib/latex/resume";
import { latexToPlain } from "@/lib/latex/text";
import type { CoverLetterOutput } from "@/lib/schemas/cover-letter";

// Turning resumes and model output into plain text for cover letters.
// Pure: tested on its own.

// The resume as plain text, in the order it reads: what the letter is
// written from (the tailored resume when there is one, so the letter
// stresses the same experience).
export function resumePlainText(resume: ParsedResumeLatex): string {
  const lines: string[] = [];
  if (resume.summary) lines.push("Summary", resume.summary.text, "");
  if (resume.skills.length > 0) {
    lines.push("Skills");
    for (const category of resume.skills) {
      lines.push(`${category.category}: ${category.items.map((item) => item.text).join(", ")}`);
    }
    lines.push("");
  }
  for (const section of resume.sections) {
    lines.push(section.title);
    for (const entry of section.entries) {
      const [title, dates, subtitle, detail] = entry.heading;
      lines.push([title, subtitle, dates, detail].filter((part) => part !== "").join(" | "));
      for (const bullet of entry.bullets) lines.push(`- ${bullet.text}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

// The name in the resume header, for signing the letter. Templates like
// the demo's print it as \textbf{\Huge Name} at the top of a center block.
// Null if the header doesn't follow that pattern; you can type it in.
export function headerName(tex: string): string | null {
  const body = tex.indexOf("\\begin{document}");
  if (body === -1) return null;
  const huge = tex.indexOf("\\Huge", body);
  if (huge === -1) return null;
  // The \textbf{ that wraps it starts shortly before.
  const textbf = tex.lastIndexOf("\\textbf", huge);
  if (textbf === -1 || huge - textbf > 20) return null;
  const group = readGroup(tex, textbf + "\\textbf".length);
  if (!group) return null;
  const name = latexToPlain(tex.slice(group.contentStart, group.contentEnd));
  return name === "" ? null : name;
}

// The model's output as one plain-text letter, signed with the name when
// there is one.
export function letterText(output: CoverLetterOutput, name: string | null): string {
  const paragraphs = output.paragraphs.map((p) => p.trim()).filter((p) => p !== "");
  const signature = name ? `${output.closing.trim()}\n${name}` : output.closing.trim();
  return [output.greeting.trim(), ...paragraphs, signature].join("\n\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}
