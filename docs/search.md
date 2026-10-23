# Search

Finding a job among hundreds: a search box in the header (on every page) and a filter on the board.

## Ranking

`lib/search/search.ts`, pure and tested. Results come in tiers, so a company match always ranks above a role match, and a role match always ranks above a listing match:

| Tier | Matches |
|---|---|
| Company | exact name, then the name starts with the query, then a word in it does, then anywhere |
| Company and role together | every word found across the two, at least one in the company ("affirm frontend") |
| Role | the same four levels as company |
| Listing | the exact phrase, then every word somewhere in it |

Within a tier, the most recently updated job comes first. Text is compared normalized, as Gmail matching does: lowercase, punctuation as spaces, "&" as "and". So "fenwick and vale" finds "Fenwick & Vale, Inc.", and "next js" finds "Next.js".

A listing match comes with a **snippet**: about 120 characters around the match, as three plain-text parts (before, match, after). The page highlights the match without ever rendering listing text as HTML.

## The header search

`components/search-box.tsx` asks `GET /api/search?q=`, which searches on the server (`server/search.ts`):

- **Listings stay on the server.** A result carries the company, role, status, where it matched, and the snippet, never the listing. Responses are a few KB.
- **A GET route, not a Server Action:** a page's Server Actions run one at a time, which makes search-as-you-type lag. GET requests run side by side, and the box cancels any it no longer needs (an `AbortController`), so a slow answer to an old query can't replace a newer one.
- **It waits for a short pause in typing** (180 ms) and needs at least two characters.
- **The keyboard:** `/` focuses it from anywhere (unless you're typing in a field), ↑ ↓ move, Enter opens, Esc closes. It follows the ARIA combobox pattern, so screen readers announce the results.
- **A result opens its page:** an application opens `/applications/[id]` (its status, history, and emails; see [status-history.md](status-history.md)), and a saved job opens its comparison (`/compare/[jobId]`). **"Filter the board by …"** at the bottom opens the board filtered by the same words.

## The board filter

The board filters the cards it already has as you type, by company and role, with the same matching (`scoreDoc` with no listing). It doesn't search listings, because the board deliberately doesn't load them (docs/performance.md); the header search covers listings. `/board?q=` fills it in, which is how "Filter the board by …" works, and it shows "13 of 334 applications" while filtering.

## Speed

Every search reads your jobs (with their listings) and ranks them in memory. On the 300-application performance database (`pnpm perf:seed`, listings of 4,000 to 6,000 characters), a search takes 27 to 42 ms end to end.

SQLite's full-text search (FTS5) would be faster at many thousands of jobs, but it would mean a migration, triggers to keep it in sync, and expressing company, then role, then listing in its ranking. If that day comes, `searchJobs` keeps its interface and only its insides change.

## Tests

- `search.test.ts`: the tier order, exact over prefix over word over anywhere, company and role together, normalization, ties by recency, the result cap, listing phrases, and snippets.
- `isolation.test.ts`: search finds only your own jobs, ranks a role match above a listing match, and returns a snippet rather than the listing.
