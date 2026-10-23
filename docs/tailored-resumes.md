# Tailored resumes

How Phase 3 turns your resume into a version tailored to one job listing, without ever adding anything untrue. This doc explains the design and the reasons behind it; the code comments cover the details. It grows as each step lands.

| Step | What | Status |
|---|---|---|
| 1 | Store the LaTeX source with a resume version | Done |
| 2 | Parse the LaTeX into editable parts, and write edits back | Done |
| 3 | Compile to PDF with Tectonic | Done |
| 4a | Profile schema, and import from the .tex | Done |
| 4b | Profile page: view and edit | Done |
| 4c | Skill names (aliases), comparison skill rows, "I have this" | Done |
| 5a | Tailoring groundwork: writer extension, proposal schema, honesty checker | Done |
| 5b | Tailoring with the LLM, storage, demo fixtures | Done |
| 5c | Review, approve, compile | Done |
| 6 | Cover letters from the tailored resume (see [cover-letters.md](cover-letters.md)) | Done |
| 7 | The "Prepare application" page, and the tailored comparison | Done |

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

## The profile (Step 4)

A one-page resume leaves things out. The profile holds everything: it starts as an import of your .tex, and you add the bullets, skills, projects, and schooling that didn't fit. Tailoring draws only from the profile, so "it must trace back to something you provided" stays checkable even when the output includes things your current resume doesn't.

### What it holds

| Part | Fields |
|---|---|
| **Skills** | name, category, aliases, proficiency, experience, optional context note |
| **Entries** | section, title, organization, dates, location or tech, sort order, a key linking it to its .tex entry |
| **Bullets** | text, per entry |
| **Highlights** | short facts, such as "5+ years of experience" |

**Every item records its source**: *from resume* (imported), *added by you*, or *confirmed from a gap* (with the job that prompted it). The Profile page uses this to show what's on your current resume and what's extra.

There's **one profile**, not one per resume version: it's "everything you've done", which doesn't version the way a resume document does. Your header (name, contact details) isn't in it; tailored resumes always keep the .tex header.

### Skill proficiency and experience

Two optional fields, set by you (imported skills start as "not set" rather than guessed):

| Proficiency | Experience |
|---|---|
| Expert, Proficient, Familiar, **Learning** | Professional, Personal projects, Coursework |

They're never printed on the resume; they guide tailoring:

- Strong, relevant skills go first; Familiar ones go last or are left out.
- **Learning** skills never appear on the resume. A cover letter may mention them, phrased as learning ("I'm currently learning TypeScript").
- **Personal projects** skills can be listed, or mentioned in project bullets, but never woven into a job's bullets, which would imply professional use.

### Rules that keep it consistent

- **The profile owns content; the .tex owns presentation.** Skills, entries, bullets, and highlights come from the profile. The header, section order, layout, and macros come from the .tex. When they differ (say you fix a typo on the Profile page), the profile wins in tailored output.
- **Entries are linked to the .tex by a key** taken from the heading at import. Tailoring can then tell an entry already in the template (edit its bullets) from one that isn't (generate a new block). Renaming an entry keeps the link.
- **Dates stay free text**, exactly as the template prints them. Order comes from a sort order you control, not parsed dates. Structured dates can be added beside the text later if needed.
- **Imports only add.** Re-uploading a .tex adds what's new, matched by text; it never deletes.
- **Past documents keep a snapshot.** Tailored resumes and cover letters save the text they used, not just profile ids, so editing or deleting profile items never changes what you sent. Later, when Gmail sync links a rejection to an application, you can see exactly what was sent.

### Built to grow

Internally, every kind of profile item (skill, bullet, highlight, entry) exposes the same basic shape to the rest of the app: id, kind, text, source. The honesty checker, the prompt builder, and the review screen work with that shape, not with each table. Adding a new kind later (certifications, spoken languages, links) means a table, an adapter to that shape, and a section on the Profile page; the tailoring code doesn't change.

### Comparison gaps: "I have this"

When a comparison lists a gap, "I have this" offers:

- **Add as a skill**, with an optional sentence on where you used it. A skill added with no context can appear in the skills list, but not in the summary or bullets (there's nothing to base a claim on), and is labeled "no context" so you can add some later.
- **Add as a highlight**, for gaps that aren't skills ("5+ years of experience").
- **"Is this the same as PostgreSQL?"**, when a similar skill exists: the gap's name becomes an alias of your skill instead of a duplicate.
- **"No, but I'm learning it"**, which adds the skill at the Learning level.

The comparison itself keeps scoring **the resume as written**, and the page says so ("Score for resume v2, as written, not your full profile"), since that's what an applicant tracking system sees. Gaps already in your profile are labeled "in profile".

### Skill names and aliases

The same skill shows up under different names ("Postgres", "PostgreSQL", "postgres"; "JS", "JavaScript"). Skill names from your profile and from every comparison are mapped to one canonical name using a **built-in alias list** (about 150 common tech aliases, in the repo) plus **your own aliases** from "Is this the same as...?".

Fuzzy-matching libraries were considered and rejected: they measure spelling similarity, and "JS" and "JavaScript" aren't similar as text. Skill taxonomies (Lightcast, ESCO, O*NET) are too broad for tech tools or need an online service the demo can't call.

**Aliases affect skill matching, not the keyword check.** Many applicant tracking systems match keywords literally, so if the listing says "Postgres" and your resume says "PostgreSQL", it's a matched skill *and* a keyword note: "The listing says Postgres; your resume only says PostgreSQL. Consider using both."

Each comparison also saves its matched and missing skills as normalized rows. That's the data for the Phase 5 skill-gap recap, collected from now on.

### Comparing the tailored resume (Step 7)

After tailoring, "Compare tailored version" scores the tailored resume against the same listing and shows **original vs tailored** (for example, 64 → 79), with a note that the tailored version was written toward this listing, so its score partly reflects that rather than a better underlying fit.

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

## Step 4a: the profile schema and the import

Code: the profile tables in `src/server/db/schema.ts`, value sets in `src/lib/schemas/profile.ts`, the import planner in `src/lib/profile/import.ts`, the shared item shape in `src/lib/profile/items.ts`, and the database side in `src/server/db/profile-store.ts` (with `profile.ts` as the app's entry point).

### Four tables

| Table | Notes |
|---|---|
| `profile_skills` | `name_key` (lowercased, spacing collapsed) is unique, so a skill can't be added twice. `aliases` is a JSON list. `proficiency` and `experience` are nullable: imported skills start "not set". |
| `profile_entries` | The four heading fields follow `\resumeSubheading`'s arguments by position: `title`, `dates`, `subtitle`, `detail`. Their meaning depends on the section (a job's subtitle is the company; a project's is its description). `latex_key` links an entry to the .tex. |
| `profile_bullets` | Belong to an entry; deleted with it. |
| `profile_highlights` | Short facts for summaries and cover letters. |

Every table has `source` (resume, added, or gap) and a `sort_order` you control. Skills and highlights from a gap also record the job (`source_job_id`), which is set to null rather than deleted if the job goes away.

**Why generic heading names?** The template uses the same four arguments for jobs, projects, and schooling, with different meanings. Naming the columns by meaning ("company", "location") would fit jobs and mislabel projects. Positional names that match the template keep the data faithful to what's printed.

### Linking entries to the .tex

`latex_key` is built from the title and subtitle, lowercased with spacing collapsed: `web developer|graph'em solutions`. Not the dates, because "2022 – Present" becomes "2022 – 2026" while it's still the same job. The column is unique, but SQLite allows any number of nulls in a unique index, so entries you add by hand (with no .tex counterpart) never collide.

### How the import works

Like the comparison code, it's split in two:

- **`planProfileImport` (pure)** compares the parsed .tex with the current profile and returns a plan: new skills, new entries (with their bullets), new bullets for existing entries, and new highlights. All the rules live here, so they're unit tested without a database.
- **`importProfileFromLatexInto` (database)** loads the profile, asks for a plan, and applies it in **one transaction**, so an import is all or nothing. New items are appended after existing ones, so an import never reshuffles what you've arranged.

The rules:

- **Only add.** A plan has no way to express removal. Re-importing the same .tex adds nothing (tested), and a .tex with an entry removed leaves the profile's copy alone.
- **Match by text, ignoring case and spacing.** Skills also match on aliases, so if your profile knows PostgreSQL with the alias "Postgres", importing "postgres" adds nothing.
- **An existing entry only gets the bullets it's missing.**
- **The summary is split into sentences, each a highlight.** They're your own claims, so they're a good starting set for what a tailored summary may say. The split only happens after ". " followed by a capital or digit, so "Node.js" and "1.8s" stay whole.

It runs automatically when you save a resume version with a .tex. It's best-effort: if the template isn't one the parser understands, the version still saves; it just doesn't feed the profile.

### Why the database code has no "server-only"

The seed builds the demo profile by running the same import as the app, so the demo can't drift from real behavior. The seed runs under `tsx`, where the `server-only` package throws, so the database functions live in `profile-store.ts` without it. That's safe because every function takes the database as an argument and touches nothing else: no secrets, no request state. The app uses `profile.ts`, which does import `server-only` and supplies the database for the current mode. This is the same exception `schema.ts` and the demo fixtures already make.

### The shared item shape

`toProfileItems(profile)` turns everything into one list of `{ id, kind, text, source }`, with ids like `skill:12` and `bullet:40` (unique across kinds, stable for the life of the row). Bullets also carry their entry's id. Step 5's prompt builder, honesty checker, and review screen will use only this shape, which is what makes adding a new kind of item later a local change.

### Demo profile

Alex's profile is the demo .tex imported with the app's own code, plus extras: Python (Familiar, coursework), Leaflet (Proficient, personal projects), Docker (Learning), a volunteer project that isn't on the resume, an extra bullet for an existing job, and an extra highlight. Levels are set on a few imported skills, the way you'd set them on the Profile page.

### Verified

- Your resume would import completely: 43 skills in 5 categories, 5 entries, 10 bullets, and your summary's 4 sentences as highlights (counts only were printed).
- The demo profile seeds as designed: 21 imported and 3 added skills, 6 linked entries plus 1 added, 10 imported and 3 added bullets, 4 highlights.

## Step 4b: the Profile page

Code: `src/app/(dashboard)/profile/` (the page, its actions, and four small components), write functions in `src/server/db/profile.ts`, form schemas in `src/lib/schemas/profile.ts`, and the "no context" check in `src/lib/profile/context.ts`.

### What it shows

- **Highlights**, **skills** grouped by category, and **entries** grouped by resume section, each entry with its bullets.
- **Labels:** where an item came from ("Added", "From a comparison gap"; imported items are the default and aren't labeled), a skill's proficiency and experience, **"Not on resume"** for entries that aren't in your .tex, and **"No context"** for skills nothing backs up.
- **"Import from active resume"**, with the outcome underneath ("Added 43 skills, 5 entries, 10 bullets, 4 highlights."). It's for a resume saved before the profile existed; it's safe to press any time, since imports only add.

Everything can be added, edited, and deleted. Reordering isn't in this step: items keep the order they were added in, and drag-to-reorder is a follow-up.

### "No context"

A skill has context if you've written something showing where you used it: a note on the skill, or its name (or an alias) in a bullet, a highlight, or an entry's subtitle or detail (a project's tech line). `skillHasContext` checks this, matching **whole terms only**: "go" isn't found in "good", but "node.js" is found in "built node.js APIs". The boundaries are "not a letter or digit" rather than regex word boundaries, because skill names contain punctuation (`c++`, `c#`, `node.js`).

It's deliberately strict. "axe-core" isn't counted as mentioned by "added axe checks to CI", because that's a different term. The fix is yours to choose: add a note, or add "axe" as an alias. Tailoring (Step 5) uses the same check, so what the label says is exactly what tailoring will do.

### How the page is built

**One Server Component page, three small Client Components.** The page reads the profile at render time and lays everything out. The client code is only what needs the browser:

- `ProfileDialog`: one dialog for every form (add or edit a skill, entry, bullet, or highlight). It owns the open state, the pending state, and the errors; the form **fields come in as children**, rendered by the server page. So there's one dialog component instead of eight.
- `DeleteButton`: a confirmation and a pending state.
- `ImportButton`: shows the import's outcome.

Inputs are plain HTML (`<input>`, native `<select>`, a `<datalist>` suggesting existing section names), so they submit with the form and need no client state.

**One action builder, many actions.** Every profile form has the same shape: check the session, `assertWritable()`, validate with Zod, write, revalidate. `formAction(schema, write)` builds that once. A `"use server"` file may only export async functions, so each exported action is a one-line async function that delegates to it.

**Errors come back as data.** A duplicate skill name (including a name that's already another skill's alias: "Postgres" when PostgreSQL lists it) returns a form error, so the dialog stays open with what you typed.

### Ownership

Every write goes through the user-scoped data layer, and the isolation tests cover them: another user can't edit or delete your skills, entries, bullets, or highlights, can't add a bullet to your entry (refused, not silently attached), and imports only read your own active resume. Name clashes are checked per user, so two users can both have "React".

## Step 4c: skill names, comparison skill rows, and "I have this"

Code: `src/lib/skills/` (the alias list, resolver, comparison rows, wording notes, and gap labels), `src/server/db/comparison-store.ts`, `confirmGap` in `src/server/db/profile.ts`, and the gap dialog on the compare page.

### The alias list and the resolver

`SKILL_ALIASES` has 187 skills, each with the other ways listings and resumes write it: `PostgreSQL: ["postgres", "psql", "pg", "postgre"]`. `createSkillResolver(profileSkills)` turns any name into one canonical skill (`{ key: "postgresql", name: "PostgreSQL" }`), using the built-in list plus your own profile aliases. Unknown skills pass through as themselves.

Choices worth knowing:

- **Ambiguous short forms are left out.** "es" could be ES6 or Elasticsearch; "tf" could be TensorFlow or Terraform. A wrong merge is worse than a missed one, because it silently claims a match.
- **Look-alikes stay separate:** Angular and AngularJS, Java and JavaScript, React and React Native, UI design and UX design. A test checks each pair.
- **A test checks no term is listed under two skills**, since that would silently merge them.
- **Your aliases win** over the built-in list where they disagree: it's your profile, and you confirmed it.

### Normalized skill rows

Each comparison now also saves its matched and missing skills in `comparison_skills`, one row per canonical skill, with the user, comparison, canonical key, and status. The result JSON still has the skills as the model wrote them; the rows make them **countable across listings**, which is what the Phase 5 recap needs. "Postgres" in one listing and "PostgreSQL" in another count as the same skill.

The comparison and its rows are written in **one transaction** by `insertComparisonWithSkills`, used by both the app and the seed, so a comparison never exists without its rows and the demo data goes through the same code. Comparisons saved before this step have no rows; the history builds from here.

### The score is for the resume as written

The score card now says "Match score for resume v2" and that your profile isn't counted, since an applicant tracking system only sees the resume you send. Nothing about your profile changes the score.

### Wording notes

Aliases decide you *have* a skill; they don't change what an applicant tracking system reads. `wordingNotes` looks at each matched skill in the listing's words: if your resume doesn't use those words but does use another name for the same skill, the page shows "The listing says **Postgres**; your resume says **PostgreSQL**. Consider using both." It's computed when the page renders, from the comparison and the resume it used, so nothing extra is stored.

### Gap labels and "I have this"

`describeGaps` labels each gap:

| Label | Meaning |
|---|---|
| **In profile** | You have it (by name, alias, or a built-in alias), just not on this resume. "AWS ECS" is in profile if your profile has "ECS". |
| **Learning** | In your profile at the Learning level. |
| **AWS, Azure in profile** | Some of the skills inside the phrase are in your profile, but not the phrase as a whole. The "I have this" button is still offered for the rest. |
| **I have this** button | Not in your profile. Shown only where writes are allowed. |

#### Gaps that name several skills

A listing often writes a gap as a sentence: "Expertise in managing cloud infrastructure (AWS, Azure, Google Cloud)". You might have AWS and Azure but not Google Cloud, and adding the whole sentence as one skill helps nobody. So `skillCandidates` (`lib/skills/candidates.ts`, pure and unit-tested) splits the phrase into the skills inside it. That example gives "cloud infrastructure", "AWS", "Azure" and "Google Cloud". The dialog lists them as checkboxes:

- **How it splits:** it drops leading filler ("Expertise in managing", "Scripting in"), splits on commas, parentheses, "and", "or", "using", "including", and keeps short parts (up to four words). It skips asides like "(asset)" and lone lowercase words. Known skills the resolver finds that the split missed are added under their canonical names. It offers at most eight.
- **The listing's wording is kept** ("AWS", not "Amazon Web Services"), since that's what the keyword check looks for.
- **Ones already in your profile** are shown ticked and disabled. When every skill inside the phrase is in your profile ("Leaflet" of "Leaflet maps"), the whole phrase stays as a choice, since it may mean more.
- **Another name** is a free-text box, for a skill the split got wrong.
- **No skill-like parts** ("5+ years in increasingly senior roles"): the whole phrase is the only choice, ticked. The highlight answer suits these better.

"Add skills" and "I'm learning these" add every ticked name, each as its own profile skill with the same details. A name that's already in your profile is skipped. It's an error only if every name was.

"I have this" opens a dialog with four answers, all posting to one action and validated by one Zod **discriminated union** on `mode`, so each answer checks exactly the fields it uses:

- **"Same as <skill>"** (offered when a profile skill has a similar name, e.g. "Leaflet" for "Leaflet maps"): the gap's name becomes an alias of that skill. You decide, because a similar name can be a different skill.
- **Add as a skill** (one per ticked name), with category, levels, and an optional "where did you use it?".
- **"No, but I'm learning it"** (or "these"): a skill at the Learning level for each ticked name.
- **Add as a highlight**, for gaps that aren't skills ("5+ years of experience").

Every answer is recorded with `source = "gap"` and the job that prompted it. The data layer checks the job (and, for an alias, the skill) belongs to you rather than trusting the form, applies the same name-clash rules as the Profile page, and the isolation tests cover all of it.

### Demo

The Granite & Gale comparison now lists Python as a gap: the listing names it as a nice-to-have, and Alex's resume doesn't mention it, but Alex's profile has it (coursework). So the demo shows an "In profile" gap.

## Step 5: tailoring

### Decisions

| Question | Decision |
|---|---|
| A proposal still fails the checker after one retry | Offending items are reverted to your words (or removed) and **flagged in review**, rather than failing the whole proposal. |
| Moving bullets between entries | Never. A bullet stays with the job it belongs to. |
| Sections your .tex doesn't have | The model may propose a **new section** when profile entries in it fit the listing better. It's a change like any other: you accept or reject it in review. |
| Rewording limits | No new numbers, no new skills, and at most ~20% longer. |
| Review | Accept or reject **each change**, plus "Accept all" with a confirmation. |

### Step 5a: the groundwork (no LLM)

Code: `src/lib/latex/resume.ts` (extended), `src/lib/schemas/tailoring.ts`, and `src/lib/tailoring/`.

#### The proposal

The model will answer with a **proposal** that refers to your profile by id (`skill:12`, `entry:7`, `bullet:40`). The only free text is the summary and reworded bullets. Skill names, entry headings, and dates always come from your profile, so the model can't rename a skill or change a date. It also returns a `trimOrder` (bullets least important first, for the one-page suggestions) and a short rationale for the review screen.

#### The honesty checker

`checkProposal` runs before you see anything. It never throws and never fixes things silently: every violation removes the item or reverts it to your own words, and records an **issue** (which item, what was wrong, what happened) that the review screen shows as a flag.

| Rule | What happens |
|---|---|
| A skill, entry, or bullet id isn't in your profile | Removed |
| A Learning skill on the resume | Removed |
| A skill category that isn't in your .tex | Removed |
| A bullet placed under a different entry | Removed there |
| An entry placed in a section it doesn't belong to | Removed there |
| A rewording adds a number the original doesn't have | Original kept |
| A rewording adds a skill the original doesn't mention | Original kept |
| A rewording grows more than ~20% | Original kept |
| The summary uses a number that isn't anywhere in your profile | Original summary kept |
| The summary claims a skill that's Learning, missing, or has no context | Original summary kept |
| An entry ends up with no bullets | Its original bullets kept |

Two rules carry more weight than they look:

- **"A rewording may not add a skill"** also enforces "personal-project skills are never implied as professional": a job bullet can't gain Leaflet if it didn't mention Leaflet. And it blocks most invented claims, which usually take the form of an extra technology.
- **"No new numbers"** catches invented metrics ("cut bugs by 40%"), the most common way tailoring turns into fabrication. Numbers are normalized first ("1,000+" is 1000, "1.8s" is 1.8).

**Finding skills in prose.** `skillKeysIn` looks for every skill term the resolver knows. Many skill names are also ordinary words ("Go" in "go-to debugger", "Next" in "next steps", "REST" in "the rest of"), so a short list of ambiguous words isn't used for detection; their unambiguous forms (Golang, Next.js, REST APIs) still are. The trade-off is that a rewording adding one of those plain words isn't caught by this rule, so your review catches it.

**A boundary fix this surfaced.** The built-in alias "js" was being found inside "React.js". `mentions()` now treats a dot as a boundary after a term (it ends sentences) but not before one. That also made the "No context" label, wording notes, and similar-skill suggestions more accurate.

The model's `isNew` flag on a section is treated as advisory: whether a section exists is a fact about your .tex, so the checker decides.

#### New entries and sections in the LaTeX

The writer (Step 2) could only edit entries already in the .tex. It can now also:

- **reorder and remove entries** within a section, keeping each kept entry's exact LaTeX;
- **add an entry from your profile** that isn't in the .tex;
- **add a whole new section**, after a section you name, or last.

New entries and sections are built by **copying an existing one as a template** and replacing its text (escaped, as always). That's why they come out formatted exactly like the rest of your resume: same macros, spacing, and indentation, with no layout code of our own. A compiled test resume with an added project and a new Volunteering section looked identical in style to the original sections.

#### From proposal to LaTeX

`toResumeEdits` maps a checked proposal from profile ids to positions in the .tex. It applies the rule that the profile owns content: an entry that's in the .tex keeps its exact LaTeX if its heading is unchanged, but if you've edited the heading on the Profile page, it's rebuilt from the profile.

#### Tests

The checker has a test per rule, run against Alex's real demo profile (built in memory with the actual import planner). A pipeline test runs the whole chain (proposal, checker, edits, LaTeX, re-parse) and checks the result section by section.

### Step 5b: the model, storage, and demo

Code: `src/server/llm/tailor.ts` (the model call), `src/lib/tailoring/prompt-context.ts` (what the model sees), `src/server/tailoring.ts` (the service), `src/server/db/tailoring-store.ts` and `tailored-resumes.ts` (storage), and `src/server/llm/tailor-demo.ts` (demo fixtures).

#### What the model sees

Not raw LaTeX. `describeTailoringContext` writes two plain-text views, both in profile ids:

- **The current resume**: the summary, each skill category with its id (`s1 Languages: TypeScript (skill:1), ...`), and each section's entries and bullets, mapped to their profile ids the same way the import links them.
- **The whole profile**: highlights, skills with their category, levels, and context ("no context: may be listed, never claimed"), Learning skills marked "never on the resume", and every entry with "on resume: yes/no" and its bullets.

Plus the listing and, if there is one, the comparison's matched skills and gaps. The system prompt states the same rules the checker enforces (so most proposals pass first time) and how to choose: keep about as much content as now so it fits one page, most relevant first, new sections only when clearly more relevant.

#### At most two model calls

| First answer | What happens |
|---|---|
| Valid, and passes the checker | Used. One call. |
| Valid, but flagged by the checker | One retry that shows the model its proposal and the exact issues, asking it to fix them. The retry's result is checked again and used, with any remaining flags. |
| Malformed (bad JSON or wrong shape) | One retry with the same request. Malformed twice is an error. |
| Refusal, cut off, or API error | An error, with no retry (see the comparison step for why). |

If the retry after a flagged answer fails in any way, the **first checked proposal is kept**, flags and all: a usable proposal with flags beats an error. In every path there are at most two calls, which the tests count.

#### Storage

`tailored_resumes` holds one row per generation, numbered per job (v1, v2, ...): the checked proposal, the checker's issues, the model, and the resume version it was tailored from. A row starts as a **draft**. Approval in Step 5c adds the accepted changes, a snapshot of the profile text they used, and the page count. Like comparisons, the stored proposal and issues are typed `unknown` and re-validated with Zod on every read; a row that no longer validates shows as "generate again" rather than breaking the page. The issue type is a Zod schema for that reason.

#### Demo fixtures

Canned proposals can't use database ids, which change on every reseed, so they're written in text (skill names, entry titles, original bullet text) and `resolveDemoProposal` maps them to the current profile. They go through the same honesty checker as real proposals.

- **Northwind** (strong fit) leads with the real-time dashboard and swaps in the volunteer map project for the component library. It also contains **one deliberate violation**: a rewording that adds "WebSockets" to a mentoring bullet. The checker keeps the original and flags it, so the public demo shows the check at work.
- **Bramblewood** (accessibility) leads with the accessibility work and pulls in a profile-only bullet about running a testing and accessibility guild.
- Other jobs get an empty proposal explaining that demo mode only has canned tailoring for some listings.

The seed creates a Northwind draft through the same resolver and checker, so the read-only demo has one to show. Tests check that every fixture resolves completely against the demo profile (a stale fixture would silently shrink otherwise), and that Northwind has exactly its one expected flag.

### Step 5c: review, approve, and the PDF

Code: `src/lib/tailoring/changes.ts` and `approve.ts` (the logic), the service functions in `src/server/tailoring.ts`, the page at `src/app/(dashboard)/apply/[jobId]/`, and the PDF route `src/app/api/tailored/[id]/pdf/`. The page is reached from **Prepare application** on a comparison.

Both this page and the comparison show where the job stands under the title. Once you've applied, that's its status pill, which links to the board. While it's still a saved job, it's **Move to Applied**, the same action as on the Saved jobs page. From these pages it keeps you where you are rather than redirecting to the board, since you may still want the cover letter, and the page re-renders with the new status.

#### From a proposal to a list of changes

The model proposes a whole resume, but you review *changes*. `currentAsProposal` expresses your current resume in the same shape as a proposal, and `listChanges` compares the two:

| Change | Example |
|---|---|
| Summary | the rewritten summary |
| Skills, per category | "Frontend: React, D3, visx, ..." |
| Add an entry | an entry from your profile that isn't on the resume |
| Remove an entry | |
| Reorder entries, per section | |
| Add, remove, or reword a bullet | |
| Reorder bullets, per entry | |
| New section | |

Each change shows **Now** and **Proposed** side by side. A rewording the checker reverted isn't a change (the text is your original), so it only appears in the checker's flags.

**Your resume must be fully in your profile.** If part of the .tex isn't (say you deleted an entry on the Profile page), a section edit would silently drop it. So the review refuses and asks you to re-import first, rather than risk losing it.

#### Deciding

Every change starts **undecided**. You accept or reject each one, and **Approve** stays disabled until each has a decision, so nothing is approved without being looked at. **Accept all** asks for confirmation, and says how many you haven't looked at yet. Reject all is there too.

`applySelection` rebuilds the resume from just the accepted changes: rejected ones leave that part as it is now. Everything in the result comes from either the checked proposal or your current resume, so it's as honest as both. The tests prove the two ends exactly: **accepting everything gives exactly the proposal**, and **accepting nothing leaves the .tex byte for byte unchanged**. In between, rejecting a removal keeps the entry in its original place, and rejecting a rewording keeps your words.

The accepted ids are checked against the proposal's actual changes on the server, so a crafted request can't slip in something that wasn't proposed.

#### What approval stores, and why

Approval stores the **LaTeX edits** (plain text plus positions in that resume version's .tex), not profile ids. A resume version's .tex never changes, so the approved PDF can always be rebuilt exactly, even after you edit or delete profile items. That's the snapshot rule from the design: past applications show exactly what was sent. The final resume in profile ids is also kept, for trimming.

Approval then builds the PDF and records the page count. A PDF problem (Tectonic missing, say) doesn't undo the approval: the edits are saved and the problem is reported.

#### Fitting on one page

If the approved resume runs past one page, the page lists the model's `trimOrder` (bullets, least important first) as checkboxes. Pick some and the resume is rebuilt without them. Trimming works on the whole resume, including sections the approval didn't touch, but never removes an entry's last bullet, and refuses if your profile no longer has something the approval uses.

#### Demo

The public demo shows both states: **Northwind** as a draft to review (with the checker's "WebSockets" flag) and **Bramblewood** approved, with a PDF. The seed approves Bramblewood through the same `buildApproval` the app uses, with every change accepted. Its PDF is pre-built by `pnpm demo:pdfs`, which reads the approved edits straight from the seeded demo database, so the script and the seed can't disagree about what the demo shows. The tailored Bramblewood resume fits on one page.

**Correction to Step 3: which demo compiles.** Step 3 said demo mode never compiles. That's right for the **public** demo, whose host has no TeX engine, but too strict for the **local demo preview** (the cookie toggle), which runs on your own machine where Tectonic is installed. Without this, approving anything in the local preview other than the one pre-built selection would report that the PDF couldn't be built. `renderLatexPdf` (`src/server/latex/render.ts`) is now the one place that decides: the public demo serves pre-built PDFs only; everywhere else compiles, falling back to a pre-built PDF if Tectonic isn't installed. Both PDF routes and approval use it.

`pnpm demo:pdfs` skips PDFs that already exist (the name is a hash of the LaTeX, so an existing file is up to date), because every compile embeds a fresh creation date and would otherwise show as a change in git. `--force` rebuilds everything.

## Step 7: comparing the tailored resume

Code: `runTailoredComparison` in `src/server/comparisons.ts`, the tailored queries in `src/server/db/comparisons.ts`, and `TailoredScore` on the Prepare application page.

Once a tailored resume is approved, **Compare tailored version** scores it against the same listing and shows **original → tailored** (the demo's Bramblewood: 58 → 66), with the caution we agreed: the tailored resume was written toward this listing, so part of any gain reflects that rather than a better underlying fit, and tailoring can't add experience you don't have. What's still missing is listed underneath.

The text compared is the tailored resume exactly as its PDF shows it, rebuilt from the approved edits, using the same comparison prompt and model call as the original.

**The original score stays the original.** A tailored comparison is a `comparisons` row with `tailoring_id` set. Every "latest comparison for this job" query (the comparison page, the Compare list, the gap labels) filters on `tailoring_id IS NULL`, so a tailored score can never quietly replace your resume-as-written score. A test checks exactly that.

**Tailored comparisons save no skill rows.** The normalized skill rows are the data for the Phase 5 skill-gap recap, which should count your resume as written. A resume written toward the listing would inflate its matches.

**The migration was hand-edited again.** drizzle-kit generated `ALTER TABLE ... ADD tailoring_id ... REFERENCES ...` without `ON DELETE cascade` (the same problem as migration 0005). Here no rebuild was needed: SQLite allows adding a nullable foreign-key column with a NULL default, cascade included. A migration test checks the cascade is there.

**Demo:** the gains are deliberately modest. Bramblewood rises from 58 to 66 because the guild bullet now covers teaching accessibility, but screen-reader testing and WCAG audits stay gaps.

## After Phase 3: editing and revising a draft

Two ways to shape a draft before approving it, besides accept and reject:

- **Edit it yourself:** quick and free, no model call.
- **Revise with notes:** for anything easier to describe than to do. One model call makes a new version.

A full resume builder (editing layout, fonts, and section order) was considered and left out. It would mean generating LaTeX instead of editing your `.tex`, and it would blur the split that keeps tailoring safe: **the profile owns content, the `.tex` owns layout**.

### Editing it yourself

Your edits are a list of small operations stored on the draft (`user_edits_json`), replayed on top of the checked proposal, which is never overwritten (`lib/tailoring/edits.ts`):

| Edit | Where |
|---|---|
| Your own wording for the summary or any bullet | **Edit** on a change card, or ✎ in the outline |
| Remove an entry or a bullet | ✕ in the outline |
| Move an entry or a bullet up or down | ↑ ↓ in the outline |
| Reset one item, back to the suggestion | **Reset** on the card or in the outline |

Review then lists the differences between your current resume and the edited draft, exactly as before. So accept and reject, approval, the LaTeX edits, and the PDF all work unchanged.

The **outline** ("Edit the resume yourself") shows the whole proposed resume with every change applied. It's for things the change list can't express: removing a project the model didn't touch, or rewording any bullet. It refuses edits that would break the PDF, like removing the only entry in a section or the only bullet of an entry.

**Your edits count as accepted:** you made them. A reset puts the suggestion back, undecided. Your decisions are saved with each edit (`decisions_json`), so they survive the page reloading. `carryDecisions` keeps a decision only while its change still says the same thing.

**Your wording is yours, but it's checked.** The honesty checker's rules are for the model, and it reverts the model's text when it breaks them. Your own text is never reverted (`resolution: "kept_yours"`), but `checkYourText` flags anything your profile doesn't back:

- a number that isn't in your profile ("40%");
- a skill that isn't in it;
- a skill it marks as Learning.

The flag suggests adding it to your profile if it's true. The profile is what keeps every future tailoring honest, so that's where facts belong.

### Checking length before approving

**Check length** builds the PDF for the changes you've accepted so far, and saves nothing. "Fits on one page" or "2 pages with these choices" tells you whether to cut something before you approve.

After approval, **Trim** can now remove a whole entry as well as bullets. It never removes a section's only entry.

In the read-only public demo there's no TeX engine, so only the pre-built PDFs can be measured.

### Revising with notes

Any change card has **Suggest a change** ("keep this, but drop the last sentence"), and there's a note for the whole draft ("this runs to two pages; drop WisePub rather than Stock Scanner"). **Revise with N notes** sends them in one model call, the same request as generating plus a revision block (`buildTailorRequest`) containing:

- the draft as you see it, your edits included;
- your decisions so far. Rejected changes aren't brought back unless a note asks.
- each note with what that change says now;
- the page count from your last length check, so "one page" can be followed;
- your own wording, kept as it is unless a note asks to change it.

The result goes through **the same honesty checker** as any proposal. A note can't add a fact: the model is told to leave it out and say so in the rationale, and the checker reverts it if it tries anyway.

The revision is saved as a **new draft version** (`revised_from_id`, with your overall note), so the old version stays in the history. Carried over:

- your wording, except on items a note asked to change;
- your decisions, for changes that read the same as before. Anything new or different waits for you.

**Demo mode** can't read notes, since it never calls the model. A revision there makes a new version labeled as such, to show how one arrives.

### Tests

- `edits.test.ts` covers every edit on the demo resume and profile:
  - edited drafts still approve to valid LaTeX;
  - refusals for edits that would break the PDF;
  - the flags on your own wording;
  - decisions carried over.
- `approve.test.ts` covers removing whole entries.
- `tailor.test.ts` covers the revision request.
- `isolation.test.ts` checks that edits, decisions, and revisions only ever touch your own drafts, and walks a revision end to end in demo mode.
