# Multi-user readiness

The app started as a single-user tool: one allowed Google account, and no notion of who owns a row. It's now **multi-user ready**: every row has an owner and every query is limited to the current user, but sign-in is still restricted to one email (`ALLOWED_EMAIL`). This doc explains the design, what was verified, and what it would take to actually open the app to other people.

## Why now

Every phase adds tables and queries (Phase 3 alone added five tables). Adding ownership later means migrating every table and revisiting every query, so the cost grows with each phase. Doing it while the profile tables were brand new kept it to one step. For a portfolio project it also shows the data model was designed with more than one user in mind, even though the app deliberately stops short of opening sign-up.

## The design

### Every table has an owner

`schema.ts` adds a `users` table and an `ownerColumn()` helper: a `user_id` that's `NOT NULL` and deletes with its user (`ON DELETE CASCADE`). **Every** table gets one, including child tables like bullets and comparisons that could, in principle, inherit ownership through their parent.

Why not inherit? Then the rule becomes "filter by owner, or join to a parent that does", and every query on a child table needs the right join to be safe. "Every query on every table filters by `user_id`" is one rule with no exceptions, and the `NOT NULL` column means the type checker flags any insert that forgets the owner (it found every one during this change).

### Uniqueness is per user

Rules that used to be global now apply per user, as composite unique indexes that start with `user_id`:

| Rule | Before | Now |
|---|---|---|
| One active resume | one in the whole database | one per user (a partial unique index on `user_id` where `is_active = 1`) |
| Resume version numbers | global | per user: everyone's first resume is v1 |
| Profile skill names | global | per user: two users can both have "React" |
| Profile entry .tex links | global | per user |

### Where the user id comes from

`requireUserId()` in `src/server/current-user.ts` is the only source:

- **Live mode:** the account for the signed-in email (from the session).
- **Demo mode:** always the seeded demo user (`DEMO_USER_EMAIL`, an `.invalid` address that can't be real), from the demo database. This covers both the public demo, which has no sign-in, and the local preview toggle, which has your real session but must show the demo user's data.

The data layer calls it **itself**. Callers never pass a user id, and it never comes from a form or URL, so it can't be forgotten or spoofed. Every write and read in `jobs.ts`, `applications.ts`, `resumes.ts`, and `comparisons.ts` filters by it, so an id from a form (a job id, a resume id) only ever reaches your own rows; someone else's id simply isn't found.

The scoping matters for writes as much as reads. Before this change, saving a resume ran "deactivate the active resume" with no owner filter. With more than one user, that would have switched off *everyone's* active resume.

**Exception, by design:** `profile-store.ts` and `user-store.ts` take the database and user id as arguments, because the seed and tests use them with their own connections. The app only reaches them through wrappers (`profile.ts`, `current-user.ts`) that pass `requireUserId()`.

### Existing data: the "unclaimed owner"

Your existing rows needed an owner, but a migration can't read `ALLOWED_EMAIL`. So migration 0005 creates user 1 with **no email**, the "unclaimed owner", and assigns all existing rows to it. On your next sign-in, `findOrClaimUserId` finds no account for your email, sees the unclaimed owner, and gives it your email: your data stays yours, with nothing typed into SQL.

The owner is only created if there was existing data, so a fresh database (like the demo's) starts with no users.

Claiming is safe only because sign-in is still limited to `ALLOWED_EMAIL`: the only person who can ever claim the data is its owner. Before opening sign-up, the unclaimed owner must be claimed or removed (see the checklist below).

## The migration (0005)

SQLite can't add a `NOT NULL` foreign key to an existing table, so every table is rebuilt: create a new version, copy the rows, drop the old, rename the new. drizzle-kit's generated SQL couldn't run (it tried to `ADD` the columns directly, and dropped `ON DELETE CASCADE`), so the SQL is hand-written; drizzle's snapshot is kept, so future migrations generate against the right schema.

The order is the subtle part. Drizzle runs a migration inside a transaction, where `PRAGMA foreign_keys=OFF` is silently ignored, and better-sqlite3 enforces foreign keys. Dropping a parent table (`jobs`) would then fire its children's `ON DELETE CASCADE` and **delete your applications and comparisons**. So:

1. New child tables reference the *new* parents (`__new_jobs`, not `jobs`).
2. Old tables are dropped children first, so no cascade ever has anything to delete.
3. New tables are renamed into place, and SQLite rewrites the children's references to the renamed parents.

## Verified

- **Data survives the migration** (`src/server/db/migrations.test.ts`): a database at migration 0004 is filled with linked rows (applications pointing at jobs, comparisons at both, bullets at entries, a gap skill linked to a job), then migrated. Every row survives, all belong to the unclaimed owner, the foreign-key check is clean, and no `__new_` names remain.
- **Your live database** was backed up to a scratch copy and migrated: the schema came out right (every table has a `NOT NULL` `user_id` with `ON DELETE CASCADE`; integrity and foreign-key checks clean). Your live database turned out to be empty, which is why the data test above matters.
- **Isolation** (`src/server/db/isolation.test.ts`): two users with overlapping data; every data-layer function is called as each user, checking it never sees, changes, or deletes the other's rows (saved jobs, the board, resumes and active versions, comparisons, profile imports). The test was checked against a deliberately broken query (one owner filter removed), and it failed as it should.
- **Claiming** (`src/server/db/user-store.test.ts`): an existing account is found, the unclaimed owner is claimed on first sign-in, and a new account is created when there's nothing to claim.
- **Demo mode end to end:** a public-demo server served every page and the resume PDF as the demo user.

## Opening it to other people: the checklist

The code is ready. These are the remaining decisions, mostly not code:

1. **Sign-in:** replace the `ALLOWED_EMAIL` check with open sign-up or an invite list. Claim or remove the unclaimed owner first.
2. **Gmail (Phase 4):** `gmail.readonly` is a restricted scope. A public app needs Google's verification and an annual third-party security assessment (typically thousands of dollars a year). The biggest blocker. The code side is ready: each user has their own connection, and tokens are encrypted with the owner's id bound in, so one user's token can't be used from another's row (see docs/gmail-sync.md).
3. **LLM costs:** comparisons and tailoring run on your Anthropic key. Add per-user quotas and rate limits, payments, or let users bring their own key.
4. **Hosting:** the live app runs on your own machine (see Hosting in CLAUDE.md). Multiple users need an always-on server with Tectonic, backups, and probably Postgres if it ever runs on more than one instance.
5. **Privacy:** other people's resumes and emails mean a privacy policy, account deletion and data export, and stronger security overall.
