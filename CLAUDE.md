# Job Application Tracker
 
A web app for tracking job applications. Portfolio project, so code quality, tests, and a clear README matter as much as features. It's **multi-user ready**: every row has an owner and every query is scoped to the current user, but sign-in is still limited to one allowed email (see `docs/multi-user.md`).
 
## What it does
 
1. **Kanban board** of applications by status: Saved, Applied, Acknowledged, Interviewing, Offer, Rejected, Ghosted.
2. **Saved jobs**: paste a listing (text + URL) to apply to later.
3. **Resume comparison**: compare a saved listing against my resume (LLM, structured output).
4. **Cover letter generation**: from listing + resume + tone/length options.
5. **Gmail sync**: scan my inbox for application-related emails and propose status changes. Suggestions land in a review inbox; nothing moves automatically.
6. **Insights**: skill gaps across compared listings, where each stands in my profile, and how they line up with outcomes (docs/insights.md).
7. **Search**: the header searches applications and saved jobs, ranked company, then role, then listing text; the board filters its cards (docs/search.md).
## Stack
 
- Next.js (App Router) + TypeScript (strict)
- SQLite via `better-sqlite3` + Drizzle ORM
- Zod for all validation (forms, Server Action input, LLM output)
- Auth.js with Google provider, restricted to a single allowed email (`ALLOWED_EMAIL`)
- Tailwind + shadcn/ui, `dnd-kit` for drag and drop
- Anthropic API for classification, comparison, and cover letters
- Vitest for unit tests, Playwright for e2e flows (`e2e/`, run in demo mode, also in CI) and for the README screenshots (`pnpm screenshots`)
- GitHub Actions CI (`.github/workflows/ci.yml`): typecheck, lint, and unit tests in one job; demo seed, production build, and e2e in the other. No real secrets
## Folder structure
 
```
src/
  app/
    (dashboard)/        board, saved, compare, apply (tailored resume + cover letter), inbox-review, insights, resume, profile
    api/                Gmail sync and OAuth callback, search, PDF routes
  server/               server-only code; every file imports "server-only"
    db/                 Drizzle schema, client factory, seed
    gmail/              mail sources (Gmail, demo inbox), OAuth, token encryption, sync pipeline
    llm/                classify, compare, cover letter (+ demo fixtures)
    mode.ts             getMode(), assertWritable()
  lib/schemas/          Zod schemas; the single source of truth for types
```
 
## Hard rules
 
### Demo mode
- `getMode()` in `src/server/mode.ts` is the **only** place that decides `"live"` vs `"demo"`. Never read `DEMO_MODE` or the demo cookie anywhere else. For trust decisions (sessions, writes, auth routes), use `isPublicDemo()` / `isWritable()` from the same file: the cookie never changes those.
- Deployment-level: `DEMO_MODE=true` makes the whole deployment demo-only (read-only, seeded DB, no auth, no real data on the machine).
- Local: a UI toggle (cookie) switches to a writable demo DB that resets on restart. **Ignore the cookie when the deployment is public.**
- The DB client factory returns the real SQLite file in live mode and the seeded demo DB in demo mode. Other code just asks the factory.
- Gmail and LLM modules must have a demo path: fixture emails instead of calling Google, canned results instead of calling Anthropic. Demo mode must never make external API calls.
- **Every Server Action or route handler that writes must call `assertWritable()` first.** Read-only is enforced on the server, not just by disabling buttons.
- Every new feature ships with seed data and a demo path in the same PR.
### Users and data ownership
- Every table has a `user_id` (`ownerColumn()` in `schema.ts`), including child tables. New tables get one too.
- **Every query filters by `user_id`**: reads, updates, and deletes, not just lists. Inserts set it. SQLite has no row-level security, so a missing filter leaks or changes another user's data.
- The user id comes only from `requireUserId()` (`src/server/current-user.ts`), called inside the data layer. Never accept it from a form, URL, or caller argument. Exception: the `*-store.ts` modules take it explicitly, because the seed and tests use them with their own connection; the app reaches them only through wrappers that pass `requireUserId()`.
- Demo mode always acts as the seeded demo user (`DEMO_USER_EMAIL`), for both the public demo and the local preview.
- Uniqueness rules are per user (e.g. one active resume *per user*), as composite indexes that start with `user_id`.
- New data-layer functions get a case in `src/server/db/isolation.test.ts` (two users; each must never see, change, or delete the other's rows).
- Sign-in stays limited to `ALLOWED_EMAIL` until a deliberate decision to open it (see the checklist in `docs/multi-user.md`).

### Code conventions
- Zod schemas live in `src/lib/schemas/`. Derive types with `z.infer`; do not hand-write duplicate types.
- Validate all Server Action input with Zod. Validate all LLM output with Zod and handle malformed output gracefully (retry once, then fail with a clear error).
- Mutations are Server Actions. Reads happen in Server Components where possible.
- Default to Server Components. Add `"use client"` only when needed (interactivity, hooks, dnd) and keep client components small. Give a Client Component only what it renders (everything passed to one is sent to the browser); load the rest on demand, and don't repeat a big list per row. See docs/performance.md.
- No `any`. Prefer `unknown` plus narrowing. Avoid `as` casts except at validated boundaries.
- Pure logic (email pre-filter, matching, status transitions) lives in plain functions with no I/O, and gets unit tests.
- Reuse the shared pieces instead of writing them again: `ActionMessage` (a Server Action's error/success line, and "This can take up to a minute"), `NativeSelect`, `Notice`, `lib/format.ts` (dates, `plural`), `server/llm/structured.ts` (every model call: structured output, validation, one retry), and `server/latex/pdf-response.ts` (PDF routes).
### Gmail sync principles
- Scope: `gmail.readonly` only.
- Use the Gmail history API for incremental sync, not full re-scans.
- Cheap pre-filter first (known ATS senders, subject patterns), then LLM only for candidates.
- Sync produces **suggestions** (`EmailEvent` with a classified type and confidence), reviewed by me in the inbox-review page. Never change an application's status without confirmation.
### LLM and resume handling
- All Anthropic calls go through the wrapper in `src/server/llm/` and are server-only. Never call the API from client components.
- Every LLM function returns Zod-validated structured output. On malformed output, retry once, then return a typed error the UI can display. Never throw raw parse errors to the user.
- Every LLM function has a demo path returning canned fixtures. Demo mode makes no network calls.
- Save results (comparisons, later cover letters) so reopening a job doesn't re-run the model. Re-running is an explicit user action.
- Resume uploads (PDF/DOCX) are parsed to text on the server and only the text is stored. Never persist the uploaded file. Enforce a size limit and show friendly errors for unreadable files.
- An optional LaTeX source (.tex) can be attached to a resume version. It's stored as text (never the file), validated, and given `\ifPDFTeX` guards on upload so it compiles under Tectonic. Tailoring requires it.
- Tailoring must never invent anything. Every skill, bullet, and fact in a tailored resume must trace back to the resume or the profile, and the app checks this in code, not only in the prompt. Text you write yourself while reviewing is the exception: it's yours, so it's flagged (with "add it to your profile") rather than reverted. Revision notes can't add facts either: the same checker runs on every revision.
- The user can preview and edit parsed resume text before saving.
- Demo seed data uses a fake resume only.
- Mock the Anthropic client in tests; tests must never hit the real API.
### Security and hygiene
- Never commit real resumes, emails, tokens, or the live SQLite file. Keep `.env`, `*.db`, and `data/` in `.gitignore`. Keep `.env.example` up to date.
- Secrets only via environment variables, accessed through a single validated `env.ts` (Zod). `ANTHROPIC_API_KEY` is optional in demo mode and required in live mode when an LLM feature is used.
## Data model (overview)
 
- **User**: email (null only for the "unclaimed owner" of pre-users data, claimed on first sign-in). Every other entity below has a user_id.
- **Job**: company, title, url, listing text, source, savedAt. A job with no linked application is a "saved job".
- **Application**: job, status, appliedAt, notes, passedScreeningAt (known to have reached a person; null is unknown, never "failed"; Interviewing and Offer set it). Its job's listing text is optional; without it, it isn't compared or counted in insights
- **Resume**: parsed text (no original file), optional LaTeX source text, version, isActive, createdAt
- **Profile** (Phase 3): one per user, not versioned. A superset of any one resume.
  - Skills: name, category, aliases, optional proficiency (Expert / Proficient / Familiar / Learning) and experience (Professional / Personal projects / Coursework), optional context note
  - Entries: section, title, organization, dates (free text, as printed), location/tech, sort order, a key linking it to its .tex entry; each with bullets
  - Highlights: short facts the tailored summary and cover letter may use
  - Every item records its source: from resume, added by me, or confirmed from a comparison gap (and which job)
  - The profile owns content; the .tex owns presentation (header, section order, layout). When they differ, the profile wins in tailored output
- **ComparisonSkill** (Phase 3): comparison, canonical skill name, matched or missing. Normalized rows for counting across listings
- **Comparison**: job, resume, result JSON (Zod-validated), a fingerprint of the listing it compared (to flag later edits), createdAt, and optionally the approved tailored resume it scored. "Latest comparison for a job" always means the resume as written (`tailoring_id IS NULL`); tailored comparisons save no skill rows
- **GmailConnection** (Phase 4): one per user; the connected address, the refresh token (encrypted with `TOKEN_ENCRYPTION_KEY`, user id bound in), the first sync's start date, Gmail's history id, needs-reconnect flag
- **EmailEvent** (Phase 4): a suggestion. From an email (message and thread id, sender, subject, snippet; never the body) or the ghosted rule. Linked application (or saved job) and how it was matched, classified type, confidence, one-line reason, the company and role the email names (prefill for "Add as application"), proposed status (a snapshot; review recomputes it from the application's current status), state (pending / confirmed / dismissed)
- **CoverLetter** (Phase 3): job, resume used, tone, versions
- **TailoredResume** (Phase 3): job, resume used, approved edits and a snapshot of the profile text used (Zod-validated), versions. A draft also holds your own edits (applied on top of the never-overwritten proposal; your wording is flagged, not reverted, when the profile doesn't back it), your accept/reject decisions, and for a revision the version it revised and your note. PDFs are rebuilt from LaTeX source + edits, not stored. Comparisons can target a tailored resume instead of a resume version
## Commands
 
```
pnpm dev            # start dev server
pnpm build          # production build
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest
pnpm test:e2e       # playwright against the demo; starts its own server on port 3100 (reuses one already running there). E2E_BASE_URL=<url> runs it against a deployed demo instead
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed demo database
pnpm demo:pdfs      # rebuild the demo's pre-built PDFs (after db:seed; needs Tectonic). Commit the result.
pnpm eval:classifier # run the email classifier on its eval set (real API calls, costs a few cents)
pnpm perf:seed       # build data/perf.db (demo + 300 applications) for measuring performance
pnpm perf:measure    # time and size each page of a running production build (docs/performance.md)
pnpm screenshots     # retake the README screenshots from a running demo (DEMO_MODE=true pnpm dev). Commit the result.
pnpm demo:gif        # re-record the README's demo GIF the same way (scripts/demo-gif.ts; no ffmpeg needed). Commit the result.
```
 
Before saying a task is done, run `pnpm typecheck && pnpm lint && pnpm test` and fix any failures.
 
## Build phases
 
Work on one phase at a time. Do not start a later phase unless I ask.
 
1. **(Done) Foundation + manual kanban**: scaffold, Drizzle schema, seed data, `getMode()`/`assertWritable()`, auth, kanban with manual add/move/edit.
2. **(Done) Saved jobs + resume comparison**: save listings, upload/parse resume, LLM comparison with Zod-validated output.
3. **Cover letters + tailored resumes**: a "Prepare application" action on a comparison. Design and decisions: `docs/tailored-resumes.md`.
   - **Profile**: everything I've done (imported from my .tex, plus extra skills, bullets, projects, schooling, and highlights that don't fit on one page). Tailoring draws only from it.
   - **Comparison gaps**: an "I have this" action adds a confirmed skill or highlight to the profile (or marks it as an alias of an existing skill, or as Learning). Comparisons still score the resume as written, and say so.
   - **Skill names**: a built-in alias list plus my own aliases map names to one canonical skill, for matching across resumes and listings. Exact listing wording still matters for the keyword check. Each comparison stores its matched and missing skills as normalized rows (the data for Phase 5).
   - **Tailored resume**: the LLM selects, orders, and lightly rewords profile content (summary from highlights, skills, entries, bullets). Checked in code (nothing outside the profile, no new numbers, Learning skills never on the resume, personal-project skills never implied as professional), kept to one page (warn with suggestions if not), and reviewed by me before use. Approved edits are applied to the LaTeX source and compiled with Tectonic in a sandbox (no shell escape, model text escaped, never raw LaTeX from the model). Without a .tex, tailoring is unavailable ("Upload your .tex to enable tailored resumes").
   - **Tailored comparison**: compare the tailored resume against the same listing and show original vs tailored scores, with a note that the tailored version was written toward the listing.
   - **Cover letter**: from the listing + tailored resume + highlights, with tone/length options. May mention Learning skills as learning.
   - Versions per job. Tailored resumes and cover letters keep a snapshot of the text they used.
4. **Gmail sync**: OAuth, incremental sync, pre-filter, classifier, review inbox, classifier eval set.
5. **Insights**: a skill-gap recap across comparisons and applications (skills most often missing, whether they're in my profile, Learning, or absent, and after Phase 4, how they relate to rejections). Shows counts and facts, never causal claims. Demo seed with enough fake history to be meaningful.
6. **Polish**: README with architecture diagram and decision log, screenshots/GIF from demo mode, CI (GitHub Actions), hosted read-only demo.
**Current phase: 6 in progress** (done so far: README with architecture diagram, decision log, and screenshots from the demo; UI redesign with dark mode and a collapsible sidebar; search; performance work; CI with GitHub Actions and e2e flows in demo mode; `.gitattributes` for LF checkouts everywhere; the hosted demo prepared: no secrets needed in demo mode, `isPublicDemo()`, auth routes 404 in the demo, security headers, reseed on every start, `render.yaml`; deployed at https://job-tracker-demo-f7ye.onrender.com/ and linked from the README; a scripted demo GIF (`pnpm demo:gif`) as the README's hero image. Phase 6's list is complete) (Phase 5 complete: listings and "passed screening" on applications, the Insights page with skill gaps, profile standing, and outcome counts, Compare all with a cost estimate, and demo history; see docs/insights.md) (Phase 1 complete: foundation, demo mode, auth, manual kanban. Phase 2 complete: saved jobs, resume upload with versions, LLM comparison with compare page. Phase 3 complete: LaTeX source and compiling, profile with "I have this" and skill aliases, multi-user readiness, tailored resumes with honesty checks and per-change review, cover letters, and the tailored comparison; see docs/tailored-resumes.md and docs/cover-letters.md. Phase 4 complete: Gmail OAuth with encrypted tokens, history-based sync, pre-filter and thread-aware matching, Haiku classifier with a 40-case eval, review inbox with live proposals, ghosted rule, pre-synced demo; see docs/gmail-sync.md)
 
## Hosting

- **Live app**: runs on my own machine (`pnpm build && pnpm start`), not on a server. Personal data (resumes, Gmail) stays local. Tectonic is installed locally for PDF compilation.
- **Public demo** (`DEMO_MODE=true`): hosted separately on a cheap/free Node host (Render, via `render.yaml`). Read-only, needs no secrets, reseeded on start (`src/instrumentation.ts`), no persistent disk, and no TeX engine: demo PDFs are pre-built fixtures, never compiled on the host. CI's e2e job runs against the same build.
- Don't add anything that requires the live app to be always-on or publicly reachable.

## Working style
 
I'm using this project to get better at TypeScript and Next.js. When you make a non-obvious choice (Server vs Client Component, how a Server Action is structured, a Zod pattern), add a brief explanation of why in your response. Keep commits small and focused, with clear messages.