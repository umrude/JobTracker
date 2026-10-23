# Status history (Phase 7)

The board shows where each application is now. Phase 7 keeps where it's been: every status change, when it happened, and what caused it. That's the base for a timeline per application, follow-up nudges, and funnel and time-in-stage counts in Insights.

| Step | What | Status |
|---|---|---|
| 7a | The history itself: recorded on every status change, backfilled for older applications | Done |
| 7b | An application page with the timeline, its comparison, and its emails | Next |
| 7c | Follow-ups: a "Today" view with nudges and upcoming interviews | |
| 7d | Insights: a funnel and time in each stage | |

## Decisions

| Question | Decision |
|---|---|
| What's stored | One row per change in `status_events`: the application, the status it moved from (none for a new one) and to, when, the source, and the email suggestion that caused it, if any. |
| When a change "happened" | For a confirmed email, **the email's date**, not the day you reviewed it. That keeps a backlog confirmed in one sitting from looking like everything happened today. Otherwise, the moment of the change. |
| Sources | `board` (added, dragged, edited, or moved from Saved jobs), `email` (a confirmed suggestion, or "Add as application"), `ghosted` (the ghosted rule), `estimated` (reconstructed, see below). |
| Recorded where | Inside the same transaction as the status change, in each of the seven places that write a status. A status and its history can't disagree. |
| Unchanged saves | Saving the edit form without changing the status records nothing. |
| Order | **Recorded order**, not date order. Confirming an old email records a step dated before steps already there. Sorted by date, it would appear ahead of the status it moved from. In recorded order, each step's "from" is the previous step's "to", and every date is still true. |
| Deleting | An application's history goes with it. If an email suggestion is ever deleted, the steps it caused stay, without the link. |

## Applications from before history was kept

`backfillStatusHistory` reconstructs a history for any application with none, using what the database knows:

1. **Applied:** on its applied date, or when it was added. Never later than the first email about it.
2. **Each confirmed email suggestion:** a step to the status you confirmed, on the email's date, linked to the email. These dates are real.
3. **Its current status:** if the application has since moved somewhere else, a last step to there, at its last update.

Steps 1 and 3 are marked `estimated`: the step happened, but its date is a best guess. The rules are a pure function (`reconstructHistory` in `lib/status-history.ts`, unit-tested). An application that already has any history is left alone, so running it again does nothing.

- **Your live database:** run it once, after the migration:

  ```
  pnpm db:migrate
  pnpm db:backfill-history
  ```

  Tested on a copy of a real database (103 applications): every application got a history, none of the chains were broken, and a second run had nothing to do.
- **The demo seed and the performance seed** run the same reconstruction for the applications they insert.

## New applications

`creationChanges` starts a new application's history:

- **Usually one step:** created at its status.
- **Two steps** for an application added at a later stage with an earlier applied date, for example "Add as application" from an acknowledgment email. It gets "applied" on its applied date, then the later status on the email's date, so the timeline starts where it really did.

## Code

- **The rules:** `lib/schemas/status-history.ts` (sources and the change type) and `lib/status-history.ts` (pure, tested).
- **Storage:** `server/db/status-history-store.ts`, which handles recording, listing, and the backfill. The stores and the seed use it with their own connection. The app reads it through `getStatusHistory()` in `server/db/applications.ts`, scoped to the current user.
- **The table:** migration `0015_status_events.sql`. It's checked in `migrations.test.ts`: the history goes with its application and owner, and stays if its email suggestion is deleted.
- **Tests:**
  - `isolation.test.ts`: every board path records history for its owner only, a confirmed email is dated by the email, deleting an application deletes its history, and the backfill is per user and runs once.
  - `lib/status-history.test.ts`: the reconstruction rules.
