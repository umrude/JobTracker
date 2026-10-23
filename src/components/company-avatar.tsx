import { cn } from "@/lib/utils";

// A company's initials on a color picked from its name, so each company
// looks the same everywhere it appears (the board, search). Full class
// names, so Tailwind finds them. Shades dark enough for the small white
// initials to reach 4.5:1 contrast (the 500s went as low as 2.1:1).
const COLORS = [
  "bg-indigo-600",
  "bg-sky-700",
  "bg-emerald-700",
  "bg-amber-700",
  "bg-rose-700",
  "bg-violet-600",
  "bg-teal-700",
  "bg-orange-700",
  "bg-fuchsia-700",
  "bg-cyan-700",
];

// A small, stable hash (djb2): the same name always gets the same color.
function colorFor(name: string): string {
  let hash = 5381;
  for (const char of name.toLowerCase()) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function CompanyAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card",
        colorFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
