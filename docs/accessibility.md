# Accessibility and mobile

The app aims for WCAG 2.1 AA, at desktop and phone sizes, in light and dark mode. This doc covers what's checked automatically, what was fixed, and what still needs a person to check.

## Checked on every CI run

`e2e/accessibility.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core), the engine behind Lighthouse's accessibility audit, on every page of the demo:

- **Pages:** board, saved jobs, compare (the list, a saved job's comparison, and an application's), Prepare application, inbox, insights, resume, and profile.
- **Rules:** WCAG 2.1 A and AA, in light and dark mode, and at iPhone size.
- **Also checked:**
  - No page scrolls sideways on a phone.
  - The skip link moves focus to the page content.

When a test fails, it names each rule and the elements that broke it.

## What was found, and fixed

| Problem | Fix |
|---|---|
| **Board cards were `<article role="button">`**, an invalid role that also wrapped another button (Edit). | Cards are plain articles again. A grip button on each card carries the drag role and instructions. |
| **No keyboard dragging.** Cards were announced as "draggable, press space to pick up", but only a mouse could move them. | Keyboard dragging, from the grip button: Space picks a card up, ←/→ move it a whole column (`column-keyboard.ts`), Space drops it, and Escape cancels. |
| **Screen-reader announcements used internal ids.** | They now use names: "Picked up Data Analyst at Fenwick & Vale… Over Interviewing… Dropped in Interviewing." |
| **Cards blocked touch scrolling.** `touch-action: none` covered most of each column on a phone, even in the read-only demo. | Touch dragging starts with a press and hold (250 ms), so a swipe scrolls. |
| **Card titles weren't headings.** `CardTitle` was a `<div>`, so heading navigation skipped every card, and some pages jumped from `<h1>` to `<h3>`. | `CardTitle` is an `<h2>` by default, with `as` for nested cards (profile entries are `<h4>`). Inbox suggestions are `<h3>` under "To review". |
| **Low contrast.** Below 4.5:1: the sidebar's group labels, the score label ("Strong fit"), white initials on bright avatars (2.1:1 on amber), and the status and "Passed screening" pills. | Darker shades in light mode: 700s for scores and avatars, 800s for pill text. Dark mode was already fine. |
| **Scroll areas you couldn't reach by keyboard:** the resume text, the insights table on a phone, and the board itself in the demo. | Each is a focusable, labelled region. |
| **Content outside landmarks** on phones (the menu row). | A labelled section. Both nav menus are labelled "Main". |
| **No way to skip the navigation.** | A "Skip to content" link, the first thing Tab reaches, hidden until focused. |
| **Motion for people who asked for less.** | With the OS's "reduce motion" setting, animations, transitions, and smooth scrolling are off (`globals.css`). |

## Mobile

Found with phone screenshots of every page, and fixed:

- **Board:** columns stretched to the tallest one, leaving most of a short column empty. On phones, each column now fits its cards. Wide screens keep equal heights, so each column is a full-height drop target.
- **Card headers:** shadcn's `CardHeader` put the action button beside the title even in a narrow card, squeezing the description into a thin column. A container query (`@md/card-header`) now puts the action on its own row when the card itself is narrow, whatever the screen size.
- **Change review:** the Edit / Suggest a change / Accept / Reject row couldn't wrap, because `shrink-0` was set on a `flex-wrap` group, so "Reject" was cut off.
- **Profile bullets:** a long bullet wrapped as a whole below its "•", leaving the dot alone on a line. This happened on desktop too. The dot now has its own column.

## Checked by hand

What axe can't judge, checked with a keyboard and by reading what a screen reader is given:

- **Moving a card with the keyboard:** each step's announcement, the drop, and cancel. The read-only demo hides drag handles, so this was checked against a temporarily writable board.
- **Focus is visible** on every control, using the same ring throughout.
- **Dialogs** (base-ui) trap focus and close on Escape.

## Known gaps

- **Editing dialogs aren't covered by the axe tests.** The demo is read-only, so the add/edit forms never open there. They use labelled fields and base-ui's dialog, but nothing checks them automatically.
- **No screen-reader session has been recorded.** The wording above was checked by reading what assistive technology is given (names, roles, live region text), not by listening with NVDA or VoiceOver.
- **Touch dragging is reachable, but not ideal.** Press and hold works. For a phone, the Edit dialog's Status field is often the easier way to move an application.
