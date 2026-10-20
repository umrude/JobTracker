# Cover letters

Phase 3, Step 6. How the app writes a cover letter for one job, and how it keeps the letter honest. It builds on the tailored resume ([tailored-resumes.md](tailored-resumes.md)); the code comments cover the details.

## The flow

On a job's **Prepare application** page, below the tailored resume:

1. Pick a **tone** (Professional, Warm, Direct) and a **length** (Short ~150 words, Standard ~250, Long ~400), and click **Write cover letter**.
2. The letter appears as editable text, with any **warnings** from the checker above it.
3. Edit it, **Save edits**, and **Copy** it. Every generation is a new **version**; earlier ones stay, switchable with the version links.

## What it's written from

- **The resume as it will be sent.** If the job has an approved tailored resume, the letter is written from it (rebuilt from its approved edits, exactly as its PDF is), so both documents stress the same experience. If the newest tailoring is still a draft, the newest *approved* one is used. Without one, the letter is written from your active resume.
- **Your highlights**, for the kind of facts a letter leads with.
- **Your Learning skills**, labelled as such, so the letter can say "I'm currently learning Docker" but never claim it.
- **The listing**, for what to connect your experience to.

The letter is signed with the name in your resume header (`\textbf{\Huge Name}` in templates like the demo's). If the header doesn't follow that pattern, it's left unsigned for you to finish.

## Honesty: warnings, not reverts

The tailoring checker reverts a bullet to your own words when a rewording breaks a rule. A letter is prose, so there's no clean "original" to revert a sentence to, and some mentions are legitimate: "your console streams robot telemetry over WebSockets" describes the company, not you, and a word-matching check can't tell that apart from a claim. So the cover letter checker (`src/lib/cover-letter/check.ts`) runs the same kinds of checks but returns **warnings** for you to judge:

| Warning | When |
|---|---|
| A number isn't backed | The letter uses a number that's not in your profile, the resume, or the listing (quoting the listing is fine: "a fleet of 50+ robots"). |
| A skill isn't yours | The letter names a skill that's not in your profile **and** not in your own bullets, highlights, or notes. If it's from the listing, the warning says that's fine when it describes the company. |
| A skill has no context | The skill is in your profile but nothing says where you used it. |
| A Learning skill isn't phrased as learning | A sentence names a Learning skill without saying "learn" (learning, learned, ...). |
| Length | The body is more than about a third off the requested length. |

"Your own words back it" matters more than it looks. "Accessibility" isn't a skill in Alex's demo profile, but a bullet about running an accessibility guild covers it, so a letter mentioning accessibility shouldn't warn. Without that rule, the first honest test letter got a false warning.

**At most two model calls**, as with tailoring: one retry if the answer is malformed, or if the checker warns (with the warnings fed back to the model). Anything still flagged after the retry is shown next to the letter.

## Storage

`cover_letters` holds one row per version, numbered per job: tone, length, the warnings, the model, the resume version, and the approved tailoring it was written from (if any). It keeps both the **generated text** as written and your **current text**, so the page can say "edited", and the original is never lost. Like everything else, every row has an owner and every query is scoped to the current user (see [multi-user.md](multi-user.md)); the isolation tests cover listing and editing.

## Demo

Canned letters for **Northwind** and **Bramblewood**, written only from Alex's resume, highlights, and the listings. A test runs both through the checker and requires zero warnings, since they model what a good letter looks like. The Bramblewood letter is honest about the gap: it names screen-reader testing as the area Alex most wants to grow in, rather than glossing over it.

The seed writes the Bramblewood letter from its approved tailored resume, so the public demo shows a complete application: tailored resume, PDF, and cover letter. Demo letters are "standard" length and don't change with the tone and length options.
