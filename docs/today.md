# Today (Phase 7c)

Today is where the app opens. It shows four things:

- the interviews coming up;
- the applications worth a follow-up;
- what's waiting in the Inbox;
- the last week of status changes.

Like everything else, it only suggests: nothing on it changes a status.

## Decisions

| Question | Decision |
|---|---|
| Where interviews come from | **You add them**, on an application's page: date and time, length, kind, where, notes. Nothing reads dates out of emails. Many interview emails ask for your availability rather than naming a time, and extracting dates would mean more model calls and a bigger classifier eval. It can come later. |
| When to nudge | An application at **Applied or Acknowledged**, quiet for **10 days**. "Quiet" means no status change, no email about it, and no follow-up since. That's well before the ghosted rule's 30 days. |
| Following up | **"I followed up"** records the date (`applications.followed_up_at`), and the nudge goes away. If it stays quiet for another 10 days, it comes back. |
| Ghosted, too | An application with a pending ghosted-rule suggestion isn't nudged: the Inbox already has the next step. Past 30 days without one (no Gmail connected, say), the nudge says it's long enough to call it ghosted. |
| The landing page | `/`, sign-in, the demo toggle, and the logo all go to Today. "Move to Applied" on Saved jobs still lands on the board, to show the new card. |
| The badge | Today's count in the sidebar is follow-ups due plus interviews within a day. |
| Calendar | Each interview downloads as an `.ics` file, so it works with any calendar app with no extra Google permissions. The file uses UTC times, so the calendar shows them in local time. |

## The page

- **Upcoming interviews,** soonest first. Each one links to its application and has **Add to calendar**. Those within a day are marked.
- **Follow up?:** each application, how long it's been quiet, when you last followed up, and **I followed up**.
- **Inbox:** a link when suggestions are waiting.
- **Last 7 days:** status changes from the history (docs/status-history.md), newest first.

On a phone, rows put the text on its own line rather than squeezing it between a pill and a date.

## Interviews on an application's page

An **Interviews** card lists upcoming interviews, then past ones. Each has a calendar file and a delete button. **Add interview** opens a dialog.

- **Validation:** `createInterviewSchema` (`lib/schemas/interview.ts`) checks the input. It takes what `datetime-local` sends ("2026-10-28T14:30", no time zone) as local time, which for the live app is yours, since it runs on your machine.
- **Ownership:** the data layer checks that the application is yours before adding an interview to it.

## Code

- **The rules:** `lib/today.ts` (`followUpsDue`, `FOLLOW_UP_AFTER_DAYS`) and `lib/ics.ts` (`interviewCalendar`: escaping, 75-byte line folding, UTC times). Both are pure and unit-tested.
- **Storage:** `server/db/today-store.ts`, with the app's wrappers in `server/db/today.ts`. The latest status change and the latest email per application are worked out in SQL, so the nudge rule gets one row per application.
- **The table:** migration `0016_interviews_and_follow_ups.sql` adds the `interviews` table, which goes with its application and owner, plus `applications.followed_up_at`.
- **The pages:**
  - `app/(dashboard)/today/`: the page, its actions, and the "I followed up" button;
  - the application page's Interviews card (`applications/_components/`);
  - `api/interviews/[id]/ics` for calendar files. It's read-only, so it works in the demo.
- **Tests:**
  - isolation: adding, listing, reading and deleting interviews, nudges, follow-ups, and activity are each only yours, and interviews go with their application;
  - pure rules: the follow-up rule, the calendar file, and the interview form's schema;
  - e2e: Today opens first and downloads a calendar file;
  - accessibility: Today is in the axe suite. Axe caught calendar links whose spoken name didn't include their visible text (WCAG 2.5.3), which is now fixed.

## Demo

The seed gives the demo something to show:

- **Interviews:** Marrow Biotech has a technical interview in two days, Solstice Interactive one tomorrow (plus a past phone screen), and Hearthstone two past interviews. They're dated from today, since the demo reseeds on every start.
- **A nudge:** Cobalt Harbor, quiet for over three weeks. Larkspur Systems isn't nudged, because its ghosted suggestion is already waiting in the Inbox.

In the read-only demo, "I followed up" and "Add interview" are disabled, and calendar downloads work.
