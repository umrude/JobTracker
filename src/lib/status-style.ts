import type { Status } from "@/lib/schemas/status";

// Each status's color, used for the board's column dots and status pills.
// Full class names (not built from parts) so Tailwind finds them.
export const STATUS_STYLE: Record<Status, { dot: string; pill: string }> = {
  applied: { dot: "bg-sky-500", pill: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  acknowledged: { dot: "bg-violet-500", pill: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  interviewing: { dot: "bg-amber-500", pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  offer: { dot: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  rejected: { dot: "bg-rose-500", pill: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  ghosted: { dot: "bg-zinc-400", pill: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300" },
};
