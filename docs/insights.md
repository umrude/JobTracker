# Insights

Phase 5. A recap of which skills your applications keep asking for that your resume doesn't show, where each stands in your profile, and how those gaps line up with outcomes. **Counts and facts, never causes**: the page shows that a skill was missing in 6 of 9 rejections; what that means is yours to judge.

| Step | What | Status |
|---|---|---|
| 5a | Listings for every application, "passed screening", listing fingerprints | Done |
| 5b | The insight numbers (pure, tested) | Planned |
| 5c | The Insights page, and comparing several jobs at once | Planned |
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
