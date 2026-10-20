# Gmail sync

Phase 4. How the app reads your inbox for news about your applications and turns it into **suggestions** you review. Nothing changes an application's status until you confirm it. The code comments cover the details; this doc explains the design and the reasons behind it.

| Step | What | Status |
|---|---|---|
| 4a | Email-event schema, pre-filter, matching, ghosted rule, demo inbox | Done |
| 4b | Connect Gmail (OAuth), encrypted tokens, the Gmail client | Done |
| 4c | Classifier, demo classifications, eval set and script | Planned |
| 4d | Sync route, review inbox, confirm and dismiss | Planned |
| 4e | Demo seed, docs, end-to-end check | Planned |

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
  - `messages.list` with an `after:` query (skipping sent mail, drafts, and chats), then `messages.get` with `format=metadata` for the sender, subject, snippet, and labels. A few requests run at a time.
  - `listNew` uses the **history API** (`history.list`, `messageAdded`), so a later sync costs only what arrived since.
  - Gmail keeps about a week of history. If it's gone (404), `listNew` returns null and sync falls back to `listSince`.
  - The history id is read *before* listing, so mail arriving mid-sync is picked up next time rather than missed.
  - At most 2,000 messages per sync, newest first, with a `truncated` flag.
- **Demo** (`demo-source.ts`): the demo inbox from Step 4a. It never contacts Google.

`parse.ts` turns Gmail's format into the app's (pure, tested). It parses `From` headers, decodes the HTML entities in Gmail's snippets, and reads the body from the plain-text part, falling back to HTML with its tags removed. Bodies are cut to 4,000 characters.
