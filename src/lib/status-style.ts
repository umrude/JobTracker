import type { Status } from "@/lib/schemas/status";

// Each status's color, used for the board's column dots and status pills.
// Full class names (not built from parts) so Tailwind finds them. Pill text
// is the 800 shade in light mode: on the tinted background, the 700s fell
// just under the 4.5:1 contrast small text needs (amber was 4.1:1).
export const STATUS_STYLE: Record<Status, { dot: string; pill: string }> = {
  applied: { dot: "bg-sky-500", pill: "bg-sky-500/12 text-sky-800 dark:text-sky-300" },
  acknowledged: { dot: "bg-violet-500", pill: "bg-violet-500/12 text-violet-800 dark:text-violet-300" },
  interviewing: { dot: "bg-amber-500", pill: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  offer: { dot: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  rejected: { dot: "bg-rose-500", pill: "bg-rose-500/12 text-rose-800 dark:text-rose-300" },
  ghosted: { dot: "bg-zinc-400", pill: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300" },
};
