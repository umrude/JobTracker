# Design

The look: a sidebar app on a soft grey canvas, with white cards, one indigo accent, and color where it carries meaning (status, company). It was inspired by a Tailwind kanban layout with spaced uppercase column headings, colored priority pills, and avatars on cards.

## Tokens

All colors are CSS variables in `app/globals.css` (oklch), used through Tailwind as `bg-card`, `text-muted-foreground`, and so on, so light and dark come from the same classes:

| Token | Light | Dark | Used for |
|---|---|---|---|
| `canvas` | cool light grey | deep blue-grey | behind page content |
| `card` | white | a step above the canvas | sidebar, header, panels, cards |
| `primary` | indigo 600 | indigo 400 | buttons, active states, the Inbox count |
| `accent` | pale indigo | dim indigo | the active nav link, feature icons |
| neutrals | slightly cool-tinted | slightly cool-tinted | text, borders, muted surfaces |

`canvas` is new: content sits on it, and anything that should read as a card needs `bg-card` (a bordered block without it shows the grey through).

**Font:** Geist, loaded by `next/font`. The font variable used to point at itself, so the app had been rendering in the browser's serif fallback; fixed in the theme.

## Color with meaning

- **Statuses** (`lib/status-style.ts`): one color each (Applied sky, Acknowledged violet, Interviewing amber, Offer emerald, Rejected rose, Ghosted grey), used for the board's column dots and status pills. Each pill has a dark-mode text color.
- **Companies** (`components/company-avatar.tsx`): initials on a color picked from the company's name by a small hash, so a company looks the same wherever it appears.
- **Pills on cards:** Passed screening (emerald) and No listing (grey).

Class names are always written out in full, never assembled from parts, so Tailwind finds them.

## Dark mode

Light, dark, or follow the system, with the toggle in the header (and on the sign-in page).

- **No flash:** `components/theme-script.tsx` runs a tiny inline script in `<head>` that sets the `dark` class before the page paints. It's a Server Component because React doesn't run scripts rendered by Client Components. `<html>` has `suppressHydrationWarning`, since its class legitimately differs from the server's.
- **The choice is per device,** in `localStorage`, not the database. "System" (the default) follows the OS, including when it changes while the app is open.
- **The toggle** (`components/theme.tsx`) reads the choice with `useSyncExternalStore`: the server renders "System", and the browser switches to the stored choice right after, with no hydration mismatch.

## The shell

`app/(dashboard)/layout.tsx`:

- **Sidebar** (wide screens): the logo, nav grouped as Job search (Board, Saved jobs, Compare, Inbox with its count, Insights) and You (Resume, Profile), and the demo controls at the bottom.
- **Header:** search, the theme toggle, an Inbox bell (with a dot when something's waiting), and your initial with sign-out.
- **Small screens:** the sidebar becomes a scrollable nav row under the header.

## The board

Columns are white panels with small spaced uppercase headings, a status dot, a count, and an empty state ("Drag a card here"). Each card has its pills, the role, the company avatar and name, and "Applied 3w ago" (`sinceLabel`). A dragged card lifts and tilts slightly.

## Checking it

Changes to the look are checked with real screenshots (Playwright, against the demo), in light and dark, desktop and phone. Tests don't catch a serif font or a grey card.
