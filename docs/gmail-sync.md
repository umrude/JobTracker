# Gmail sync

Phase 4. How the app reads your inbox for news about your applications and turns it into **suggestions** you review. Nothing changes an application's status until you confirm it. The code comments cover the details; this doc explains the design and the reasons behind it.

| Step | What | Status |
|---|---|---|
| 4a | Email-event schema, pre-filter, matching, ghosted rule, demo inbox | Done |
| 4b | Connect Gmail (OAuth), encrypted tokens, the Gmail client | Done |
| 4c | Classifier, demo classifications, eval set and script | Done |
| 4d | Sync route, review inbox, confirm and dismiss | Done |
| 4e | Demo seed, docs, end-to-end check | Done |

## The flow

1. **Connect Gmail**, separately from signing in. Sign-in keeps its minimal scopes; connecting asks only for `gmail.readonly`.
2. **Sync now** (a button, since the live app isn't always on). The first sync looks back to a start date you choose; later syncs fetch only what's new.
3. **Pre-filter**: headers and snippet only. Most email stops here.
4. **Match** each candidate to one of your applications.
5. **Classify** candidates with the model: acknowledged, interview, assessment, rejection, offer, or not relevant.
6. **Review**: each suggestion shows the email, the application, and the proposed status. Confirm, change the application, or dismiss.

## Decisions

| Question | Decision |
|---|---|
| Store email bodies? | **No.** Metadata, Gmail's snippet, and the model's one-line reason only. Bodies are fetched from Gmail when needed and never stored: less personal data at rest, and Gmail stays the source of truth. |
| How far back the first sync looks | Your earliest application minus a week, capped at 6 months, **or a start date you pick** before the first sync. |
| Ghosted suggestions | **Yes**: rule-based (no model), for applications with no email activity for 30 days. You confirm them like any other. |
| Gmail library | Google's official `@googleapis/gmail` (typed, far smaller than `googleapis`) plus `google-auth-library` for OAuth. |
| Refresh tokens expire after 7 days while the Google app is unverified | A clear **"Reconnect Gmail"** banner; everything else keeps working. |
| Storing the connection | Only the refresh token, **encrypted** with a key kept outside the database. Access tokens are fetched per sync and never stored. |

## Step 4a: deciding what matters, without a model

Code: `src/lib/email/` (`prefilter.ts`, `matching.ts`, `ghosted.ts`), the schemas in `src/lib/schemas/email.ts`, the `email_events` table, and the demo inbox in `src/server/gmail/demo-inbox.ts`. All of the logic is pure and tested.

### The pre-filter

Runs on the sender, subject, snippet, and Gmail's labels. An email is a **candidate** if:

1. it's from a **known applicant-tracking system** (Greenhouse, Lever, Workday, Ashby, and about 15 more, including subdomains like `us.greenhouse-mail.io`). These are always kept, even if Gmail filed them under Promotions; or
2. it names **a company you applied to** (in the sender's name, the subject, or the snippet, or as a label of the sender's domain: `recruiting.cobaltharbor.example`), or its subject has a **hiring phrase**, and Gmail hasn't filed it under Promotions or Social.

The hiring phrases are deliberately specific. "Offer" alone matches "Special offer: 50% off", so offers need "offer letter", "job offer", or "offer of employment". Company names are compared as whole phrases after normalizing (lowercase, `&` as "and", punctuation and legal suffixes like "Inc." dropped), so "Fenwick & Vale, Inc." matches "fenwick and vale", but "Larkspur Systems" isn't found in "Larkspur Logistics".

Gmail's Promotions and Social tabs do a lot of the work: company newsletters and job-board alerts land there, so they're dropped even though they name a company or say "interview".

### Matching

Links a candidate to one application, in order of trust:

1. **Thread**: a reply in a thread already linked to an application belongs to it. This matters because recruiter replies often never repeat the company name ("Update on your application ... we've decided to move forward with other candidates").
2. **Company**: exactly one application at a company the email names.
3. **Company and title**: several applications at the same company, narrowed to one by the job title in the subject or snippet (ignoring anything in parentheses, so "Backend Engineer (Node.js)" is found as "Backend Engineer").

Otherwise the email is left **unlinked**, with the possible applications listed, and you pick one in review. A wrong link is worse than none: it would suggest changing the wrong application.

### The ghosted rule

An application still waiting to hear back (applied, acknowledged, or interviewing) with **no email activity for 30 days** gets a "Ghosted?" suggestion. If one is already pending, it isn't repeated. If you dismiss it ("not ghosted"), it waits for another 30 days of silence before suggesting again.

### What's stored

`email_events` holds one row per suggestion: the email's metadata and snippet (never the body), the linked application (if any) and how it was linked, the classifier's type, confidence, and one-line reason, the proposed status, and the state (pending, confirmed, dismissed). Each email is processed once per user (a unique index on user and Gmail message id). Ghosted suggestions have no email, so those columns are empty.

### The demo inbox

Demo mode never calls Google: it reads 14 fake emails instead, matching the seeded applications. Besides real hiring news (an acknowledgement through Greenhouse, an interview invitation, a take-home through Ashby, an offer, a rejection), it includes the traps a real inbox has:

| Email | Why it's there | What happens |
|---|---|---|
| A rejection that never names the company | Recruiter replies often don't | Linked only by its thread |
| "Unfortunately we need to reschedule your interview" | "Unfortunately" plus "interview" | A candidate; the classifier must call it an interview, not a rejection (Step 4c) |
| Your employer's all-hands (Larkspur **Logistics**) | You applied to Larkspur **Systems** | Dropped: the names don't match as whole phrases |
| A company's own newsletter, in Promotions | Names a company you applied to | Dropped |
| "Special offer: 50% off" and a job-board alert | "Offer" and "interview" in marketing | Dropped |
| A cold recruiter's "interview request" | Not about any application | A candidate, but unlinked; the classifier should call it not relevant |
| An offer and a rejection for applications already at that status | No news, really | Will suggest no change (Step 4d) |

Tests check the pre-filter keeps exactly the nine hiring emails and drops all five traps.

## Step 4b: connecting Gmail

Code: `src/server/gmail/` (`oauth.ts`, `token-cipher.ts`, `mail-source.ts`, `live-source.ts`, `demo-source.ts`, `parse.ts`), the `gmail_connections` table and its data layer (`gmail-store.ts`, `gmail-connections.ts`), the callback route `src/app/api/gmail/callback/route.ts`, and the Inbox page (`/inbox-review`).

### Setting it up (once, in Google Cloud Console)

The same OAuth client as sign-in, with a few additions:

1. **APIs & Services → Library:** enable the **Gmail API**.
2. **Credentials → your OAuth client:** add the redirect URI `http://localhost:3000/api/gmail/callback` (next to the sign-in one).
3. **OAuth consent screen → Data access:** add the scope `.../auth/gmail.readonly`.
4. **OAuth consent screen → Audience:** keep the app in **Testing** and add your Gmail address as a test user.
5. In `.env`, set `TOKEN_ENCRYPTION_KEY` (the command is in `.env.example`).

Then **Inbox → Connect Gmail**. Google warns that the app isn't verified: expected for a personal app in Testing.

### Connecting

"Connect Gmail" is its own consent, separate from sign-in, asking only for `gmail.readonly`:

- **State and PKCE.** The connect action sets a short-lived, `httpOnly` cookie holding a random state and a PKCE verifier, scoped to the callback path. The callback rejects anything whose state doesn't match (so nobody can plant their authorization code in your session), and the code Google returns is useless without the verifier.
- **`access_type=offline` and `prompt=consent`**, so Google issues a refresh token every time (it otherwise only does on the very first consent), and `include_granted_scopes=false`, so the token carries this one scope only.
- **Checked on return:** the granted scopes must include `gmail.readonly` (Google's screen lets you untick it), and a refresh token must be present. The connected address is read with `users.getProfile`; it can differ from the account you sign in with.
- **Refused in demo mode**, on the server: the public demo is read-only, and a local demo preview must not put a real token in the demo database.

### Storing the token

Only the refresh token is kept, in `gmail_connections` (one per user), **encrypted** with AES-256-GCM by `TOKEN_ENCRYPTION_KEY`:

- The key lives in `.env`, not the database, so a copy of the database alone can't read your inbox.
- GCM is authenticated: a tampered value fails to decrypt rather than producing garbage.
- The owner's user id is bound in as associated data. A token copied into another user's row won't decrypt there (tested in `isolation.test.ts`).
- The value is versioned (`v1.`), leaving room to rotate keys later.

Access tokens are short-lived and fetched for each sync, never stored.

### Disconnecting and reconnecting

**Disconnect** deletes the row first, then revokes the token at Google, so access really ends rather than lingering in your Google account. If Google can't be reached, the row is still gone and the page says to remove the app at myaccount.google.com/permissions.

**Reconnect:** while the Google app is in Testing, Google expires refresh tokens after **7 days**. When Google refuses the token (`invalid_grant`), the mail source throws `GmailReconnectNeeded`. Sync (Step 4d) marks the connection, and a **"Reconnect Gmail"** banner appears on every page. Reconnecting the same address keeps the sync position, so nothing is re-read; connecting a different address starts over. A token that won't decrypt (for example after a key change) is handled the same way.

### The first sync's start date

Before the first sync, the Inbox page shows the start date: by default a week before your earliest application, at most six months back (a month back if you have none). You can pick another date, up to a year back. After the first sync it's fixed, since later syncs follow Gmail's history instead.

### The mail source

Sync reads email through one interface, `MailSource`, with three methods:

- `listSince(date)`: the first sync.
- `listNew(historyId)`: later syncs.
- `body(id)`: the classifier's input, never stored.

There are two implementations, and sync (Step 4d) is written once against the interface:

- **Gmail** (`live-source.ts`):
  - `messages.list` with an `after:` query (skipping sent mail, drafts, and chats), then `messages.get` with `format=metadata` for the sender, subject, snippet, and labels.
  - **Promotions and Social are skipped in the query itself**, except mail from an applicant-tracking system. That's the pre-filter's own rule, applied before anything is read, so a first sync reads far fewer messages.
  - **Paced to Gmail's quota** (`quota.ts`). Gmail meters each user in quota units per minute (15,000 by default). Reading a message costs 5, so at most 3,000 reads a minute. A token bucket holds every call to 200 units a second (80% of the limit). A refusal anyway (HTTP 429, or a 403 quota error) is waited out (Google's `Retry-After`, else exponential backoff) and retried up to 5 times. Without this, a first sync asked for about 24,000 units a minute and Google cut it off with "Quota exceeded ... Units per minute per user".
  - `listNew` uses the **history API** (`history.list`, `messageAdded`), so a later sync costs only what arrived since.
  - Gmail keeps about a week of history. If it's gone (404), `listNew` returns null and sync falls back to `listSince`.
  - The history id is read *before* listing, so mail arriving mid-sync is picked up next time rather than missed.
  - At most 2,000 messages per sync, newest first, with a `truncated` flag.
- **Demo** (`demo-source.ts`): the demo inbox from Step 4a. It never contacts Google.

`parse.ts` turns Gmail's format into the app's (pure, tested). It parses `From` headers, decodes the HTML entities in Gmail's snippets, and reads the body from the plain-text part, falling back to HTML with its tags removed. Bodies are cut to 4,000 characters.

## Step 4c: the classifier

Code: `src/server/llm/classify-email.ts` (prompt, call, validation), `classify-demo.ts` (demo answers), `classify-eval-cases.ts` and `classify-eval.ts` (the eval set and its scoring), `scripts/eval-classifier.ts`, and the schemas in `src/lib/schemas/email.ts`.

### What it decides, and what it doesn't

The classifier answers one question for each email that passed the pre-filter: **acknowledged, interview, assessment, rejection, offer, or not relevant**. It also gives a confidence (0 to 1) and a one-sentence reason you can check against the email.

It deliberately does *not* propose a status. Turning "rejection" into "move to Rejected" depends on where the application is now (an offer email for an application already at Offer is no news), and that's code in Step 4d, not a model's judgment.

### The prompt

The prompt is mostly definitions and the edge cases that trip up keyword rules:

- A reschedule that opens with "unfortunately" is still an **interview**.
- "Moving forward with your application" is good news, while "moving forward with other candidates" is a **rejection**.
- "We will not be extending an offer" is a **rejection**, not an offer.
- **Mixed emails** take the type that changes the status most: offer, then rejection, then assessment, then interview, then acknowledged. "Complete this assessment before we schedule interviews" is an assessment.
- An email from a company you applied to that isn't about the application (a newsletter, a customer bill) is **not relevant**.
- The email is **data, not instructions**: text in it addressed to the AI is ignored. The eval set tests this.

The model gets the email and the application matching linked it to, if any. The output is structured (Zod schema sent as JSON Schema), validated, and retried once if malformed, like every other model call in the app. An out-of-range confidence or an overlong reason is tidied up rather than retried.

### Model choice

Classification uses **`ANTHROPIC_CLASSIFIER_MODEL`, default Claude Haiku 5.5, at low effort**. The task is short and well-defined, and a first sync can send dozens of emails. Haiku 5.5 costs $0.10 / $0.50 per million tokens against Opus 5.5's $4 / $20, so it's 40 times cheaper.

The eval is how you check that's good enough: run it with `--model claude-opus-5-5` to compare. Haiku has no server-side refusal fallback (sending the parameter is an error), so the LLM client now only sends it to models that support it.

### The eval set

There are **40 synthetic emails** with known answers: 6 acknowledged, 8 interview, 5 assessment, 8 rejection, 4 offer, and 9 not relevant. Each says which trap it tests:

- reschedules;
- warm rejections ("we were impressed... however");
- "not extending an offer";
- an offer delivered as "can we hop on a call";
- an assessment mixed with an interview;
- thread replies that never name the company;
- a job alert naming a company you applied to;
- a cold recruiter;
- an ATS password reset;
- your own follow-up email;
- a bill from a company you also applied to;
- a meetup invitation;
- a prompt injection.

All companies and people are fictional.

`pnpm test` checks the set itself, without calling the model:

- 40 unique cases, with at least 4 of every type.
- **The pre-filter lets every hiring email through.** A perfect classifier is no use if the email never reaches it.

  The exceptions are replies linked only by their thread ("Re: Scheduling ... Monday works"). That's a real gap in the 4a pre-filter, and Step 4d closes it: an email in a thread already linked to an application is a candidate whatever the pre-filter says.

### Running the eval

`pnpm eval:classifier` makes real API calls (about a cent on Haiku, well under a dollar on Opus). It prints:

- each answer;
- accuracy;
- a per-type table (expected, correct, predicted);
- **calibration**: how often it's right when its confidence is 0.8 or higher, and when it's lower;
- each miss with its note and the model's reason;
- the tokens used and the cost.

Options:

- `--model` and `--effort` compare settings without changing code;
- `--only <id>` reruns one case;
- `--min-accuracy` sets the pass mark: it exits 1 below that (default 0.9).

The script runs under `tsx --conditions=react-server`, which resolves `server-only` to its empty module, so it uses the app's real classifier code rather than a copy.

### Demo mode

`classify-demo.ts` has a canned answer for each of the 9 demo emails the pre-filter keeps: what a good classifier should say, including the reschedule (interview) and the cold recruiter (not relevant). A test checks they cover exactly the pre-filter's candidates and pass validation unchanged.

## Step 4d: syncing and reviewing

Code: `src/server/gmail/sync.ts` (the pipeline), `src/server/gmail-sync.ts` (live and demo wiring), `src/app/api/sync/route.ts`, `src/lib/email/propose.ts`, the review data layer (`email-event-store.ts`, `email-events.ts`), and the Inbox page.

### One sync

**Sync now** on the Inbox page posts to `/api/sync`, which runs `syncInbox`:

1. **Read what's new.** With a saved position, that's Gmail's history since then. Before the first sync, or if Gmail's history has expired, it reads by date: from the start date, or a day before the last sync.
2. **Skip what was processed before**, by Gmail message id.
3. **Pre-filter and match**, oldest first, so an acknowledgement links its thread before the rejection that replies to it is matched, even within one sync.

   **The fix for the gap the eval found:** a message in a thread already linked to an application is a candidate even if the pre-filter wouldn't keep it ("Re: Scheduling ... Monday works").
4. **Classify** the candidates, a few at a time.
   - Live: the body is fetched, sent to the model, and dropped.
   - Demo: the canned answers.

   An email the classifier couldn't answer is stored anyway, marked "Couldn't classify". With the sync position moving on, it would otherwise never be seen again.
5. **Store** one row per candidate.
   - A *sure* "not relevant" (confidence 0.8 or above) is filed straight under dismissed: kept, so it isn't processed again, but out of your way.
   - Everything else waits for review.
   - Emails the pre-filter dropped aren't stored at all.
6. **The ghosted rule**: waiting applications with no email and no change for 30 days get a "Ghosted?" suggestion.

   A recent change counts as activity, as well as an email: an application moved to Interviewing last week isn't ghosted.
7. **Save the position** (Gmail's history id), only after everything is stored. A sync that fails halfway is simply run again, and the messages it already stored are skipped.

`syncInbox` takes its database, mail source, and classifier as arguments. Live mode, demo mode, the tests, and the demo seed (Step 4e) all run the same code.

**Why a route handler, not a Server Action:**

- A sync is a job with a result to report, not a form submission.
- It leaves room for something else to start one later, such as a scheduled task on this machine.

It's POST-only and needs your session cookie (SameSite=Lax), so another site can't start a sync in your name. The read-only public demo refuses it on the server.

**Failures** come back as one clear sentence, for example:

- "Connect Gmail first."
- "Set ANTHROPIC_API_KEY."
- "Reconnect Gmail", which also marks the connection and shows the banner.
- "The sync didn't finish... try again", which saves nothing partial.

### What a suggestion proposes

The classifier says what the email *is*. `proposeStatus` (pure, tested) decides what that means for the application:

| Email | Moves from | To |
|---|---|---|
| Acknowledged | Applied, Ghosted | Acknowledged |
| Interview, assessment | Applied, Acknowledged, Ghosted | Interviewing |
| Offer | Applied, Acknowledged, Interviewing, Ghosted | Offer |
| Rejection | any open status, including Offer (a rescinded offer) | Rejected |

It never moves an application backwards: a late "we received your application" doesn't undo Interviewing. Anything else is **news**: shown, with "Got it" instead of a move.

**The proposal is worked out live.** What's shown and what Confirm applies come from the application's status *now*, not from when the email was synced.

Example: you confirm the rejection, and the acknowledgement from two weeks earlier for the same application becomes news instead of offering "Rejected → Acknowledged". If the application has moved on by the time you click, Confirm says so instead of moving it. The proposal stored at sync time stays as the record. Confirming stores what was actually applied.

### Reviewing

Each card shows:

- the type and confidence. Below 0.8 it's marked unsure, with a dashed outline.
- the subject, sender, snippet, and the model's one-line reason.
- the linked application with its current status, and the proposed move.
- "Open in Gmail", since the body is never stored here.

The actions:

- **Move to …** confirms: the application moves, in one transaction with marking the suggestion confirmed.
- **Dismiss** (or **Got it** for news, **Not ghosted** for the ghosted rule). Dismissing a ghosted suggestion resets its 30-day timer.
- **Link / Relink** picks the application for an unlinked (or wrongly linked) email. Its suggestion is worked out again for that application, and later emails in the same thread follow the link.

Suggestions that change something come first, then news, newest first. "Recently reviewed" lists the last ten decisions, including what was filed away automatically. The nav shows how many are waiting.

Every action re-checks on the server that the suggestion is yours and still pending. Isolation tests cover listing, confirming, dismissing, and linking across two users, including linking your email to someone else's application.

## Step 4e: the demo, and checking it end to end

### The demo arrives already synced

The public demo is read-only, so it can't sync: `pnpm db:seed` (and every local dev-server start) runs the real `syncInbox` over the demo inbox with the canned classifications. The demo opens on an Inbox with **9 suggestions**:

| Kind | Suggestions |
|---|---|
| Changes | Cobalt Harbor and Fenwick & Vale acknowledged; Driftwood Analytics to Interviewing; Fenwick & Vale rejected (linked only by its thread); **Larkspur Systems ghosted** |
| News (no change) | Marrow's assessment and Solstice's reschedule (already Interviewing), Hearthstone's offer (already at Offer), Ironclad's rejection (already Rejected) |

The cold recruiter was filed away automatically, and shows under "Recently reviewed".

Two seed changes made that possible:

- **Larkspur Systems** was applied to 41 days ago, with no email since, so the ghosted rule fires. Its note now reads "Got the automated acknowledgement, then nothing."
- **Seeded applications' `updatedAt`** is their applied date. It used to default to the moment of seeding, which counts as activity and would stop the ghosted rule from ever firing in the demo.

In the local preview (writable), you can confirm, dismiss, link, and sync again. Syncing again reads the five non-hiring emails and finds nothing new.

### Checks

- **`src/server/db/seed.test.ts`** seeds a temporary database and checks:
  - 9 waiting suggestions, changes first;
  - exactly one ghosted suggestion, for Larkspur;
  - the recruiter filed away.
- **The public demo, run for real** (`pnpm build`, then `DEMO_MODE=true pnpm start`):
  - The Inbox page renders all 9 cards with the nav count.
  - `POST /api/sync` is refused with 403 ("Syncing is disabled in the read-only demo.").
  - The Gmail callback redirects with "unavailable".
  - Every other page still renders.
- **Not checked end to end:** the live round trip with Google (connect, a real sync, an expired token) needs your browser and account. The pieces are tested individually:
  - the OAuth URL, state, and scope checks;
  - token encryption;
  - the history fallback;
  - the pipeline, with the mail source swapped for the demo one.

  Try it with your own inbox using the setup steps in Step 4b.

### Trying it with your Gmail

1. Do the one-time setup in Step 4b and set `TOKEN_ENCRYPTION_KEY` and `ANTHROPIC_API_KEY`.
2. **Inbox → Connect Gmail.** Pick a start date if the default isn't right.
3. **Sync now.** The first sync reads everything since the start date (up to 2,000 messages), so it takes a while. Later ones are quick.
4. Review. After 7 days (while the Google app is in Testing), you'll see **Reconnect Gmail**. Reconnecting the same address picks up where it left off.

## After Phase 4: edge cases

### Applications you haven't added

Email about a job that isn't on the board shows up in one of three ways:

- **A saved job you applied to but didn't move to Applied.** Matching covers saved jobs as well as applications, so the email links to it. The card offers **Add to board as Acknowledged** (or whatever the email implies).
  - Confirming creates the application as of the email's date, with the saved job's notes moved over, like "Move to Applied" on the Saved jobs page.
  - A rejection still adds it, as Rejected: you did apply.
- **A job you never entered at all.** The card has **Add as a new application**, prefilled with:
  - the company and role the classifier read in the email;
  - the status the email implies;
  - the date it arrived.

  You check the fields and save. The email counts as confirmed, and later replies in its thread follow the new application.
- **Pick it yourself.** The link picker lists likely matches first (same company), then every application, then every saved job.

**Reading the company and role.** The classifier now also returns the hiring company and job title, in the email's own words, or null when the email doesn't say. It's told that mail through Greenhouse, Workday, or HackerRank comes from the company named in it, not the service, and that a recruiting agency's client is only named if the email names it. These values only ever prefill a form you check.

**The pre-filter** couldn't recognize a company you never entered. It now also looks for a few specific hiring phrases in Gmail's preview, not just the subject: "thanks for applying", "your application for", "schedule an interview", "moving forward with other candidates", "offer letter", "take-home". So "Quick question" from a company you never entered, opening "Thanks for applying for the Product Designer role...", gets through. The phrases are deliberately narrow, since every candidate costs a model call, and Promotions and Social still don't count.

### Near-identical roles at one company

Two applications at Affirm, "Senior Software Engineer, Frontend (Auth Experiences)" and "Senior Software Engineer, Frontend (App Experience)", used to be indistinguishable: matching ignored the parenthesized part of a title. Matching now tries, most specific first, and each step must single out exactly one role:

1. **The full title**, qualifier included, however it's punctuated ("Senior Software Engineer - Frontend - App Experience" matches).
2. **The title without its parenthesized part**, for roles whose titles differ before the parentheses.
3. **The words that differ**: "auth" and "experiences" against "app" and "experience". If both roles' own words appear (say "Auth Experiences team" and "your app experience"), it's left to you.
4. **The role the classifier read**, after classification. That comes from the whole body, not just the preview, and settles most ATS acknowledgements, whose subject is only "Thank you for applying to Affirm". The same step finds the company when only the body names it.

If none of these settles it, the email waits unlinked with both roles at the top of the picker. A wrong link is worse than none. After you link the first email in a thread, later replies follow it.

**Saved jobs and applications are matched together**, so one Affirm application and one saved Affirm role are told apart the same way rather than mixed up.

**One-word company names that are ordinary words** ("Affirm", "Square", "Ramp") would match "we affirm our commitment" in any email. In the subject and preview, a one-word name now only counts with the capitalization you typed. The sender's name and domain are trusted as before.

### Running out of Anthropic credits

When the account is out of credits, Anthropic refuses every call ("Your credit balance is too low..."). That used to come back as a generic API error, and sync stored each email as "Couldn't classify". Since every email is processed once, those emails would never have been classified, even after topping up.

Now:

- The LLM client recognizes it as its own error, `out_of_credits`, with the message "Your Anthropic account is out of credits. Add credits at console.anthropic.com (Settings, Billing)". Comparisons, tailoring, and cover letters show it too.
- **Account-level failures stop the sync instead of being stored**: out of credits, a missing or rejected key, or the API unreachable after the SDK's own retries. Nothing from the batch that hit the failure is stored, and the sync position isn't saved. Emails stored before it are skipped next time, and the rest are classified then. So **adding credits and syncing again picks up exactly where it stopped**.
- The Sync button says so: "Sync stopped: your Anthropic account is out of credits... Nothing was skipped: add credits..., then sync again."
- Problems with one email (a refusal, or malformed output twice) are still stored as "Couldn't classify", so one odd email can't block every sync.

### Classify again

Emails already stored as "Couldn't classify" (from before this, or from a one-off failure) don't fix themselves: sync processes each email once. When there are any, the Inbox shows a **Classify again** card. It posts to `/api/sync/reclassify`, which runs `reclassifyStored`:

- **Only the stored emails.** The inbox isn't re-read. Each body is fetched again for the model, since bodies were never stored.
- **Same steps as sync.** The classification, matching, proposal, and filing rules are the same code (`classifiedFields`), so a retried email ends up exactly where a working sync would have put it. A sure "not relevant" is filed away; the rest wait for review.
- **Links are kept or redone.** Emails already linked keep their link, and a link you made yourself stays marked as yours. Unlinked ones are matched again, now with saved jobs, near-identical roles, and the company and role the classifier reads.
- **The same stop rule as sync.** If the credits run out again partway, the emails done so far stay done, and Classify again finishes the rest next time.

Cost: one model call and one Gmail read (5 quota units) per email. On Haiku, about $0.0003 an email, so about 4 cents for 125.
