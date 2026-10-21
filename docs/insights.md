# Insights

Phase 5. A recap of which skills your applications keep asking for that your resume doesn't show, where each stands in your profile, and how those gaps line up with outcomes. **Counts and facts, never causes**: the page shows that a skill was missing in 6 of 9 rejections; what that means is yours to judge.

| Step | What | Status |
|---|---|---|
| 5a | Listings for every application, "passed screening", listing fingerprints | Done |
| 5b | The insight numbers (pure, tested) | Done |
| 5c | The Insights page, and comparing several jobs at once | Done |
| 5d | Demo seed, docs, end-to-end check | Planned |

## Decisions

| Question | Decision |
|---|---|
| What's analyzed | Jobs with a listing **and** a comparison of your resume as written. Tailored comparisons don't count: they were written toward the listing. Everything else is left out, and the page says how many and why. |
| Comparing many jobs at once | A **Compare all (N)** button, with a cost estimate and a confirm step. |
| A model-written summary | **No.** A fixed layout states the counts reliably, makes no causal claims, and costs nothing. |
| Small samples | Counts are always shown. Fewer than 5 outcomes on either side is labeled "too few to compare". |
| Rejections | Rejected and **Ghosted** both count as rejections, with ghosted shown separately: a late reply does happen, rarely. Applied and Acknowledged are undecided and left out. Interviewing and Offer have progressed. |
| Listing edited after a comparison | The comparison still counts, with a "listing changed" note and a Re-compare button, so fixing a typo doesn't quietly shrink your data. |
| Passed screening | A date on the application, empty meaning **unknown**, never "failed". See below. |

## Step 5a: what insights can count

### A listing on every application

Insights come from comparisons, and a comparison needs the listing. Before 5a, only saved jobs could have one, so applications added on the board or from an email could never count. Now:

- **The listing is optional everywhere you create or edit an application**: the board's add and edit forms, and "Add as application" in the Inbox. A blank one in the edit form clears it.
- **Cards without a listing say "No listing"**, with a hover note that they can't be compared or counted.
- **The Compare page lists applications too**, under their own heading with their status, so any application with a listing can be compared.

### Passed screening

Applicant-tracking portals often show when an application moves to something like "Under Consideration" (iCIMS, Workday): it got past screening to a person, even if it's rejected later. That's a real signal. A missing skill matters differently in a rejection at screening than in one after a person reviewed the resume.

But most rejections don't say which happened. So the field is **"known to have passed screening"**, and empty means unknown, not failed:

- **You tick it** in the board's edit form ("Under Consideration" in the portal, or similar). It records the date.
- **Interviewing and Offer set it automatically**, from a board move, a confirmed email, or "Add as application". An interview means you passed. Unticking can't undo that while the status implies it.
- **Migration 0013 backfilled it** for applications already at Interviewing or Offer, and left everything else unknown.

In 5b this splits rejections into **rejected after screening** (you know it passed) and **stage unknown** (the rest). There's deliberately no "rejected at screening" group, because the app can't know that. The main comparison stays all rejections against those that progressed. The screening split shows only once enough applications are marked to say anything.

Not inferred from indirect clues (a rejection the same day, an email's wording): those are guesses, and counts built on guesses would undercut "facts only".

The card shows **"Passed screening"**. It means a person saw it, not "beat the ATS", since some companies have a person read every application.

### Listing fingerprints

Each comparison now stores a fingerprint of the listing it compared (`lib/listing.ts`: FNV-1a over the text with whitespace collapsed, so re-pasting with different line breaks isn't a change). If the listing is edited later, the comparison page says **"The listing changed since this comparison"**, and the comparison keeps counting until you re-run it. Comparisons from before 5a have no fingerprint and show no note: unknown, not changed.

The store reads the listing itself when saving a comparison, rather than taking it from the caller, so no path can forget it or pass the wrong text.

### Demo

Interviewing and Offer applications have a screening date. Ironclad Ledger, rejected after its final round, is the "passed screening, then rejected" case, like TMX.

## Step 5b: the numbers

Code: `lib/insights/build.ts` (the numbers), `lib/insights/skills.ts` (counting skills), `server/db/insights-store.ts` (loading the data), and `server/insights.ts` (the page's entry point). All of it reads; nothing calls a model.

### What's counted

**Included:** a job (saved or applied) with a listing *and* a comparison of your resume as written. Each job counts once, with its latest comparison.

The rest is listed with the reason, not dropped silently:

- no listing;
- a listing but not compared yet;
- compared, but the listing changed since (still counted; decision 5);
- compared against an older resume version (still counted).

**Scope:** all compared listings, or applications only. Saved jobs say what the market asks for; applications are the only ones with outcomes.

### Skills

For each skill the included listings ask for:

- **asked:** how many listings asked for it;
- **missing:** how many times your resume didn't show it;
- **where it stands in your profile:**
  - **in your profile:** you have it, so your resume just didn't show it. Tailoring can fix that.
  - **Learning:** marked Learning in your profile.
  - **absent:** not in your profile at all.

Most often missing first, then most asked.

**Counting the same skill once.** A comparison's skills are the model's own phrases ("AWS (ECS, RDS, S3)", "Production PostgreSQL experience"). Counted as written, the same skill would be spread over many one-off phrases. `splitSkillPhrases` uses the skill resolver (built-in aliases plus your own) to find the known skills inside each phrase:

- "AWS (ECS, RDS, S3)" counts toward AWS, ECS, RDS, and S3;
- "Postgres" and "PostgreSQL experience" are one skill;
- a phrase with no known skill ("On-call ownership") stays as written;
- within one comparison, a skill that's both matched and missing counts as matched.

The catch: skill names that are also ordinary words ("Go", "Rust", "Express") aren't picked out of phrases, the same trade-off the honesty checker makes. So "Go, Rust, or Java" counts as Java only. A missed skill is better than "the next step" counted as Next.js.

### Outcomes

Only applications, and only among listings that asked for the skill. A skill's row compares like with like:

- **Rejected:** Rejected plus Ghosted, with ghosted shown inside it ("missing in 6 of 9 rejections, 2 of them ghosted").
- **Progressed:** Interviewing or Offer.
- **Waiting** (Applied, Acknowledged) is in neither.
- **comparable** only with at least 5 on both sides (`MIN_SAMPLE`). Otherwise the page shows the counts labeled "too few to compare".
- **The screening split:** rejections divide into **after screening** (you marked it passed) and **stage unknown**. It's shown once at least 5 rejections are known to have passed screening (`SCREENING_MIN`); before that, one line says how many.

Counts, never causes: the page shows both sides and leaves the reading to you.

## Step 5c: the page

Code: `app/(dashboard)/insights/` (the page, its action, and the Compare all button) and `lib/llm-pricing.ts`. The page is a Server Component: every number is computed on the server. Only "Compare all" runs in the browser.

### What's on it, top to bottom

- **Scope:** all compared listings, or applications only (`?scope=applied`, parsed with Zod, so anything else falls back to all).
- **Coverage:**
  - how many listings are analyzed;
  - notes on comparisons that predate a listing edit or used an older resume;
  - **Compare all (N)** for jobs with a listing but no comparison;
  - a collapsed list of jobs without a listing, linking to where to add one.
- **Outcomes:** rejected (with ghosted inside), progressed, and waiting, among analyzed applications. Under them, how many rejections are known to have passed screening, and either the split or the one line saying it shows from 5.
- **"In your profile, but not on your resume":** the skills listings asked for that your resume didn't show but your profile has. The most actionable list on the page, since a tailored resume can bring them forward.
- **Most often missing:** the top 25. Each row shows:
  - how many of the listings that asked for it your resume was missing it in;
  - where it stands in your profile;
  - "missing in x of n" among rejected and progressed applications, with ghosted shown inside rejected;
  - "too few to compare" under 5 on either side;
  - with enough screening data, columns for after screening and stage unknown.
- **The fine print:** counts from your own comparisons, not causes, and small numbers say very little.

### Compare all

A full run can be over a hundred comparisons at 15 to 40 seconds each, far too long for one request. So the page runs **batches**: each call compares the next 3 jobs in parallel, and the page loops, refreshing the numbers after each batch, with a **Stop** button that takes effect after the batch in progress.

**Before it starts**, a confirm step names:

- the number of jobs;
- the model (`ANTHROPIC_MODEL`);
- **an estimated cost**: about four characters per token for the listing and resume, plus the instructions and a generous allowance for the output and the model's thinking, priced from `lib/llm-pricing.ts`. It errs high: roughly 5 cents a comparison on Opus 5.5.

The same price table now serves the classifier eval's cost line.

**Each batch picks its own jobs** on the server. The browser sends only the ids of jobs that already failed in this run, so one listing the model can't handle isn't retried forever. Ids that aren't yours are simply never among the jobs it looks at.

**Like Gmail sync, account-level failures stop the run:** out of credits, no or rejected API key, the API unreachable, or no active resume. Whatever was compared before that is saved, and running it again continues. Per-job failures are listed with their reason.

The read-only public demo disables the button. The local demo preview compares with canned results, for free.

### Tests

`isolation.test.ts` runs Compare all for two users in demo mode:

- it stops without a resume;
- the plan's count and free demo estimate;
- batches of 3 until none remain;
- the other user's job never touched.

`llm-pricing.test.ts` covers prices and the estimate.
