import { readGroup } from "@/lib/latex/scan";

// Converting between LaTeX snippets and plain text.
//
// latexToPlain is for *reading*: it produces what a person (or the model)
// should see, e.g. "Fennel \& Finch" -> "Fennel & Finch". It can lose
// formatting, which is fine because unchanged items are written back from
// their original LaTeX, not from this text.
//
// plainToLatex is for *writing* model or user text into the .tex. It
// escapes every special character, so the text can only ever be text:
// "\input{/etc/passwd}" comes out as harmless printed characters, never a
// command. This is the main defense against prompt injection through a
// job listing (see docs/tailored-resumes.md).

// Commands whose {argument} isn't text (spacing, colors, labels): the
// whole argument is dropped.
const DROP_ARGUMENT = new Set(["vspace", "hspace", "label", "color", "includegraphics"]);

const SYMBOLS: Record<string, string> = {
  textbullet: "•",
  LaTeX: "LaTeX",
  TeX: "TeX",
  ldots: "…",
  dots: "…",
  textbar: "|",
  textless: "<",
  textgreater: ">",
  textasciitilde: "~",
  textasciicircum: "^",
  textbackslash: "\\",
  textendash: "–",
  textemdash: "—",
  quad: " ",
  qquad: " ",
};

// Characters that are escaped with a backslash: \& \% \$ \# \_ \{ \}
const ESCAPABLE = new Set(["&", "%", "$", "#", "_", "{", "}"]);

export function latexToPlain(latex: string): string {
  return convert(latex)
    .replaceAll("---", "—")
    .replaceAll("--", "–")
    .replaceAll("``", "“")
    .replaceAll("''", "”")
    .replace(/\s+/g, " ")
    .trim();
}

function convert(latex: string): string {
  let out = "";
  let i = 0;
  while (i < latex.length) {
    const ch = latex.charAt(i);

    if (ch === "%") {
      const newline = latex.indexOf("\n", i);
      i = newline === -1 ? latex.length : newline;
      continue;
    }

    if (ch === "\\") {
      const next = latex.charAt(i + 1);
      if (/[A-Za-z]/.test(next)) {
        let j = i + 1;
        while (/[A-Za-z]/.test(latex.charAt(j))) j++;
        const name = latex.slice(i + 1, j);
        if (latex.charAt(j) === "*") j++;
        i = j;

        if (name in SYMBOLS) {
          out += SYMBOLS[name];
        } else if (name === "href" || name === "textcolor" || DROP_ARGUMENT.has(name)) {
          // \href{url}{text} and \textcolor{color}{text}: drop the first
          // argument; the second is plain {text}, handled below.
          const group = readGroup(latex, i);
          if (group) i = group.end;
        }
        // Any other command (\textbf, \emph, \small, ...) just disappears;
        // its {argument}, if any, is kept as text by the brace rule below.
        // Like TeX, swallow the spaces after a command word.
        while (latex.charAt(i) === " ") i++;
        continue;
      }

      // A control symbol: \& \% \  \\ etc.
      if (ESCAPABLE.has(next)) out += next;
      else if (next === " " || next === "\\" || next === ",") out += " ";
      i += 2;
      continue;
    }

    // Grouping braces and math-mode dollars aren't text.
    if (ch === "{" || ch === "}" || ch === "$") {
      i++;
      continue;
    }
    out += ch === "~" ? " " : ch;
    i++;
  }
  return out;
}

const ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  // These render as other glyphs in some LaTeX font encodings, so use
  // the explicit commands.
  "|": "\\textbar{}",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
  "–": "--",
  "—": "---",
};

// Whitespace (including newlines) collapses to single spaces, so the text
// can't start a new paragraph inside a \resumeItem argument.
export function plainToLatex(plain: string): string {
  return [...plain.replace(/\s+/g, " ").trim()].map((ch) => ESCAPES[ch] ?? ch).join("");
}
