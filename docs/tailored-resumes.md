# Tailored resumes

How Phase 3 turns your resume into a version tailored to one job listing, without ever adding anything untrue. This doc explains the design and the reasons behind it; the code comments cover the details. It grows as each step lands.

| Step | What | Status |
|---|---|---|
| 1 | Store the LaTeX source with a resume version | Done |
| 2 | Parse the LaTeX into editable parts, and write edits back | Done |
| 3 | Compile to PDF with Tectonic | Done |
| 4 | Profile: everything you've done, plus "I have this" on comparison gaps | Planned |
| 5 | Tailoring with the LLM, checked in code, reviewed by you | Planned |
| 6 | Cover letters from the tailored resume | Planned |
| 7 | The "Prepare application" page | Planned |

## The flow

1. You upload your resume (PDF/DOCX, parsed to text) and, optionally, its LaTeX source.
2. You compare it against a saved job (Phase 2).
3. On "Prepare application", the model proposes a tailored version: a rewritten summary, plus skills and bullets selected and ordered for this job, with light rewording.
4. The app checks the proposal (nothing new, no invented numbers). You review each change, then approve.
5. The approved edits are applied to your LaTeX source and compiled to a PDF.
6. A cover letter is written from the listing plus the tailored resume, so both stress the same experience.

## Honesty: what the model can and can't do

The model can **choose, order, and lightly reword**. It can't **add**. "Don't lie" is in the prompt, but the prompt alone isn't a guarantee, so the important rules are enforced in code:

- **Skills** in the output must all exist in your resume or profile. Reordering is fine; a new skill fails the check.
- **Bullets** are referenced by ID. A bullet ID that doesn't exist fails the check.
- **Numbers** in a reworded bullet must appear in the original. This catches invented metrics ("increased sales 40%"), the most common way tailoring turns into fabrication.
- **You review every change** before anything is used. The checks catch the mechanical lies; your review catches the subtle ones.

A failed check gets one retry, then a clear error, the same pattern as comparisons.

### The profile (Step 4)

A one-page resume leaves things out. The profile holds everything: it starts as an import of your .tex, and you add the bullets, skills, projects, and schooling that didn't fit. Tailoring draws only from the profile, so "it must trace back to something you provided" stays checkable even when the output includes things your current resume doesn't.

When a comparison lists a gap, an **"I have this"** button adds that skill to your profile. You confirmed it, so using it later is honest. The comparison itself keeps scoring the resume as written, since that's what an applicant tracking system sees.

## Step 1: storing the LaTeX source

**Why store the source as text?** The project rule is to never keep uploaded files, only text. A `.tex` file *is* text, so storing its contents keeps to the spirit of the rule: no binary files, nothing to clean up, and it lives in the same database row as the version it belongs to (`resumes.latex_source`). It's optional; a version without it simply can't be tailored, and the Resume page says "Upload your .tex to enable tailored resumes."

**Where it's attached.** On the review step of the upload, next to the parsed text, so one version holds both. Validation happens in the Server Action (`saveResumeAction`), with pure helpers from `src/lib/latex/source.ts`:

- `checkLatexSource` rejects empty input, anything over 100,000 characters, binary files (a NUL character means it isn't text), and files without `\begin{document}` ... `\end{document}`.
- The byte size is checked *before* the file is read, so a huge upload is rejected cheaply.

### The `\ifPDFTeX` guards

Many resume templates (including yours) contain two lines that only pdfLaTeX understands:

```latex
\input{glyphtounicode}
\pdfgentounicode=1
```

They make the PDF's text readable by applicant tracking systems. Tectonic uses the XeTeX engine, which doesn't define them and stops with an error. XeTeX's output is already readable, so the fix is to run those lines only under pdfLaTeX:

```latex
\usepackage{iftex}
\ifPDFTeX
\input{glyphtounicode}
\fi
```

`addPdfTexGuards` does this automatically on upload. Three details that matter:

- **One guard per line.** In real templates the two lines can be far apart, with fonts and margins in between. One big `\ifPDFTeX` block around both would hide all of that from XeTeX and quietly change the layout.
- **Idempotent.** Running it on its own output changes nothing, and lines already inside an `\ifPDFTeX ... \fi` block (one guard each, or a shared block) are left alone. So re-uploading never stacks guards.
- **Line endings are kept.** Windows `\r\n` files stay `\r\n`.

The file still compiles exactly as before under pdfLaTeX, so the same `.tex` works wherever you compile it today.

### Why Tectonic

Tectonic is a single binary, it turns off risky TeX features with `--untrusted`, and it can be forced offline with `--only-cached`. That matters because tailored text ends up inside a LaTeX file: without those restrictions, LaTeX can read files on the machine (`\input{...}`) or run commands. The live app runs on your own machine (see Hosting in CLAUDE.md), where Tectonic is installed. The public demo has no TeX engine; it serves pre-built PDFs.

Tested so far: the demo template and your resume (with the guards) both compile to one page, and their text extracts cleanly. The first compile downloads packages (about 80 seconds); after that a compile takes about 1.5 seconds.

## Step 2: reading and rewriting the LaTeX

Code: `src/lib/latex/` (`scan.ts`, `text.ts`, `resume.ts`) and the edit shape in `src/lib/schemas/resume-edits.ts`. All of it is pure: no files, no network, no database, so it's tested directly with strings.

### What counts as editable

The parser understands the "Jake's Resume" family of templates, which both the demo resume and your resume use:

| Part | In the LaTeX | Becomes |
|---|---|---|
| Summary | the paragraph after `\section*{Summary}` | `summary.text` |
| Skills | `\resumeItem{\textbf{Category}: a, b, c}` in a section whose title contains "skill" | `skills[]`, each with `id` (`s1`, `s2`, ...), `category`, `items[]` |
| Entries | `\resumeSubheading{...}{...}{...}{...}` in any other section | `sections[].entries[]`, each with `id` (`e1`, `e2`, ...) and its four heading parts |
| Bullets | `\resumeItem{...}` inside the entry's nested `\resumeSubHeadingList` | `entries[].bullets[]`, each with `id` (`e3.b1`, ...) |

Anything else (the header, entry headings, dates, education) is read so it can be shown, but never rewritten. If the file doesn't match the template at all, parsing fails with a clear message instead of guessing.

### Why a small scanner instead of regexes

Regexes can't count nested braces: in `\resumeItem{Built \textbf{React} apps}`, the first `}` isn't the end. LaTeX also has comments (`% ...` to the end of the line) that can contain things that look like commands, and escapes like `\%` that aren't comments. `scan.ts` handles exactly those three things (matching braces, skipping comments, skipping escaped characters) and nothing more. A full LaTeX parser would be far bigger, and still couldn't run your macros, so it wouldn't understand the template any better.

Two details that bit or nearly bit:

- **Command names are matched whole and case-sensitively.** `\resumeSubheading` (an entry) and `\resumeSubHeadingList` (a list) differ only by the case of one letter, and `\resumeSubHeadingList` is a prefix of `\resumeSubHeadingListEnd`.
- **The body starts at `\begin{document}`, not the first `\begin`.** The preamble's `\newcommand` definitions contain `\begin{tabular*}` and `\begin{itemize}`.

### Plain text in, LaTeX out

The model and the review screen work in plain text: `Fennel \& Finch` is shown as `Fennel & Finch`. Two functions in `text.ts` convert:

- **`latexToPlain`** is for reading. It unescapes characters, keeps the text of formatting commands (`\textbf{React}` becomes `React`), and turns `--` into an en dash. It can lose formatting, which is fine because of the next point.
- **`plainToLatex`** is for writing. It escapes every special character, so whatever the model writes can only ever be printed text. `\input{/etc/passwd}` comes out as harmless characters on the page, never a command. This is the main defense against a job listing that tries to steer the model ("prompt injection"). It also collapses newlines so text can't start a new paragraph inside an argument, which wouldn't compile.

**Unchanged items keep their original LaTeX.** When an edit lists a bullet whose text matches an original bullet, the writer uses that bullet's original LaTeX, so its formatting (bold, links, escapes) survives exactly. Only new or reworded text goes through `plainToLatex`. Reworded bullets lose inline formatting such as bold; that's an accepted trade-off.

### Writing edits back

`applyResumeEdits(tex, edits)` takes plain-text edits:

```ts
{
  summary?: string;                                  // new summary
  skills?: { categoryId: string; items: string[] }[]; // whole skills block, in order
  entries?: { entryId: string; bullets: string[] }[]; // an entry's bullets, in order
}
```

It replaces only the exact character ranges the parser recorded, so every other character of the file stays the same (a test checks this byte for byte). Replacements are applied from the end of the file backwards, so the positions recorded for earlier parts stay valid. New lines copy the indentation and line endings of the lines they replace.

The writer only checks *shape*: ids exist, an entry being edited has bullets, nothing is edited twice. It deliberately doesn't judge honesty (new skills, invented numbers). That check belongs to tailoring (Step 5), which knows about the profile; keeping the two separate means each is simple and tested on its own.

### Verified

- Your resume parses completely: the summary, 5 skill categories, and every bullet in all four sections.
- Edited versions of both resumes compile with `--untrusted --only-cached` (the settings the app will use), and re-parse after editing.
- A bullet containing `\input{x}` printed as text; the command didn't run.
- Your resume with one extra bullet and a longer summary ran to **two pages**. It's right at the one-page limit, so the page-count check in Step 3 matters.

**Known limitation:** the Roboto font doesn't draw `\textbackslash`, so a backslash typed in resume text disappears from the PDF. It's harmless (the text still can't run as a command) and unlikely in a resume, so it's left as is.

## Step 3: compiling to PDF

Code: `src/server/latex/` (`tectonic.ts`, `compile.ts`, `demo-pdfs.ts`), the route `src/app/api/resumes/[id]/pdf/route.ts`, and `scripts/build-demo-pdfs.ts`.

### How a compile runs

`runTectonic(tex)`:

1. Makes a fresh private temp folder, so concurrent compiles can't collide and nothing is left anywhere permanent.
2. Writes the LaTeX to `resume.tex` there.
3. Runs `tectonic -X compile --untrusted --only-cached resume.tex` with a 30-second timeout.
4. Reads `resume.pdf`, counts its pages, and deletes the folder (even if something failed).

**Security choices**, since the LaTeX contains model-written text:

- **`execFile`, not `exec`.** No shell is involved, so nothing is ever interpreted as a shell command. The arguments are fixed; none come from user input.
- **`--untrusted`.** Tectonic only enables TeX's shell escape (`\write18`, which can run programs) when asked with `-Z shell-escape`; `--untrusted` blocks even that, along with any other feature Tectonic considers insecure.
- **`--only-cached`.** Compiling never touches the network. Packages must already be in Tectonic's cache, so compile your resume once from a terminal to download them (the error message says how if one is missing).
- **Escaped text** (Step 2) means model text can't contain LaTeX commands in the first place. The flags are a second layer, not the only one.

### Turning failures into messages

Tectonic's error output is mostly TeX's transcript. The useful part is the first line shaped like `error: resume.tex:<line>: <message>`. `describeFailure` picks that out:

| Situation | Kind | What you see |
|---|---|---|
| Tectonic not found | `not_installed` | Points to `TECTONIC_PATH` in `.env.example` |
| ``File `x.sty' not found`` | `missing_package` | Names the package and the one-time command to download it |
| Any other LaTeX error | `latex_error` | "Line 3: Undefined control sequence" |
| Over 30 seconds | `timeout` | Stopped, with a message |

### The PDF route, and why it isn't a Server Action

`GET /api/resumes/:id/pdf` returns a version's PDF. It's a **route handler** because it returns a file the browser opens directly from a link (`target="_blank"`), and Server Actions are for mutations triggered from forms. It only reads, so it doesn't call `assertWritable()`, but it still requires a session. Responses are marked `Cache-Control: private, no-store` because a resume is personal data, and the page count is sent in an `X-Page-Count` header for later use.

The Resume page's **View PDF** link is a plain `<a>`, so the page stays a Server Component with no client code for it.

### Demo mode never compiles

The public demo host has no TeX engine. Instead, `pnpm demo:pdfs` compiles every LaTeX document the demo can show, ahead of time, into `src/server/db/fixtures/pdf/`, and those PDFs are committed. Each file is named by a **hash of the LaTeX it came from** (`demoPdfKey`). At runtime, demo mode hashes the LaTeX it would have compiled and serves the matching file.

Keying by content rather than by resume id or job means:

- Tailored demo resumes (Step 5) work the same way: hash the edited LaTeX, serve its PDF.
- A stale PDF can never be served for changed LaTeX; there just won't be a match. A test fails if the demo resume changes without re-running `pnpm demo:pdfs`.
- Line endings are normalized before hashing, so a Windows checkout that converts the file to CRLF still finds the PDF.

LaTeX with no pre-built PDF (for example, a `.tex` uploaded during the local demo preview) gets a clear "only the sample resume has PDFs in demo mode" message.

### Tests

The compiler is passed in as a function (`exec`), so tests fake every outcome (success, missing compiler, timeout, LaTeX error) without Tectonic installed, and check the temp folder is always deleted. One integration test compiles the demo resume with the real Tectonic, and skips itself on machines without it (set `TECTONIC_PATH` to run it).
