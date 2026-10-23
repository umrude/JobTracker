import { cn } from "@/lib/utils";

// A company's initials on a color picked from its name, so each company
// looks the same everywhere it appears (the board, search). Full class
// names, so Tailwind finds them.
const COLORS = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-fuchsia-500",
  "bg-cyan-600",
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
