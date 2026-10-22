# Performance

How the app stays fast with hundreds of applications, how that's measured, and the numbers.

## Measuring

Changes are judged by numbers, on a production build. `pnpm dev` compiles pages on demand and is much slower, so it isn't a fair measure.

```
pnpm perf:seed                                          # data/perf.db: the demo + 300 applications
pnpm build
DEMO_MODE=true DEMO_DATABASE_PATH=./data/perf.db pnpm start   # port 3000; PORT=3100 to match the default below
pnpm perf:measure                                       # --url http://localhost:3000 if needed
```

- **`scripts/perf-seed.ts`** builds a separate database, never your real one: the normal demo, plus 300 fictional applications with realistic 4,000 to 6,000-character listings, notes, about half of them compared, and 150 Inbox suggestions. A seeded random generator makes every run identical, so before and after compare like with like (`--count` for more).
- **`DEMO_DATABASE_PATH`** points demo mode at that file. The public-demo setting needs no sign-in, so the script can fetch pages directly.
- **`scripts/perf-measure.ts`** fetches each page a few times and reports:
  - **Server:** median time for the whole response;
  - **HTML:** size of a full page load;
  - **RSC:** size of what a client-side navigation fetches. That's the React Server Components payload, requested with the `RSC: 1` header like the Next.js router does.

## What was slow, and why

With about 100 real applications, the app felt sluggish. The server wasn't the problem: most pages rendered in tens of milliseconds. What was sent to the browser was.

| Page | Server | HTML | RSC | Cause |
|---|---|---|---|---|
| Board | 114 ms | 2,335 KB | 1,369 KB | Every card carried its full application, listing text included |
| Inbox | 907 ms | 9,685 KB | 4,126 KB | Every card carried a picker listing all 340 jobs |
| Insights | 491 ms | 90 KB | 48 KB | Splitting skill phrases rescanned ~1,000 known terms per row |

(Baseline, 300 extra applications, production build.)

## What changed

### Board: send what a card shows

The board is a Client Component (drag and drop needs it), and **everything a Client Component is given is serialized into the page**. It was given every application's full row, including listing text the cards never show: about 5,000 characters each with real listings.

- **`listApplicationSummaries`** returns only what lists need: company, title, status, and two booleans worked out in SQL (has a listing, passed screening). The Compare page and the Inbox use it too.
- **The edit dialog loads the full application when it opens** (`loadApplicationAction` → `getApplicationDetails`), fresh each time.
- **Long columns show 20 cards**, then "Show N more". Every card is a draggable with its own listeners, so hundreds at once slow down rendering and dragging.

### Inbox: share the list, draw pickers on demand, page the cards

- **The list of applications and saved jobs is sent once**, through a React context (`link-choices.tsx`), instead of once per card. Each card is given only its few likely matches.
- **The picker is drawn when you click "Link..."**: 150 cards × 340 options was over 50,000 `<option>` elements.
- **25 suggestions at a time**, with "Show more" as a link (`?show=50`), so the server renders only what's on screen. Working out each card's likely matches (matching it against every job) was most of the 907 ms.

### Insights: remember each phrase

Splitting a comparison's skill phrases ("AWS (ECS, RDS, S3)") into known skills checks each phrase against every term the resolver knows. The same phrases repeat across hundreds of comparisons, so a run now keeps what it found per phrase (`PhraseCache`).

### Everywhere: a loading skeleton

`app/(dashboard)/loading.tsx` shows a skeleton while a page renders on the server, so clicking a nav link responds right away instead of appearing to do nothing.

## After

| Page | Server | HTML | RSC |
|---|---|---|---|
| Board | 50 ms | 427 KB | 70 KB |
| Inbox | 92 ms | 244 KB | 86 KB |
| Insights | 92 ms | 92 KB | 49 KB |
| Compare | 72 ms | 574 KB | 287 KB |
| Saved, Profile, Resume | under 25 ms | under 100 KB | under 60 KB |

The board's navigation payload is 95% smaller. The Inbox page is 97% smaller and ten times faster on the server.

Compare is plain server-rendered HTML (a list of every job, no browser code), so it's large but cheap. Search (next) makes it easier to use, and it can be paged the same way if it grows.

## Rules of thumb for new code

- **Give a Client Component only what it renders.** Everything passed to one ends up in the page. Load the rest when it's needed (a dialog opening, a row expanding).
- **Don't repeat a big list per row.** Share it once (context), or render it on demand.
- **Page long lists on the server** with a `?show=` link rather than rendering everything and hiding it.
- **Measure with `pnpm perf:measure`** before and after, on a production build.
