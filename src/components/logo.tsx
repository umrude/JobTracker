import Link from "next/link";
import { BriefcaseBusinessIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The app's mark: an indigo tile with a briefcase, and the name. `compact`
// shows the tile alone (the mobile header); `nameClassName` lets the
// collapsed sidebar hide the name visually but keep it for screen readers.
export function Logo({
  compact = false,
  className,
  nameClassName,
}: {
  compact?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <Link
      href="/today"
      aria-label={compact ? "Job Tracker" : undefined}
      className={cn("flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
        <BriefcaseBusinessIcon className="size-5" />
      </span>
      {!compact && (
        <span className={cn("text-lg font-semibold tracking-tight whitespace-nowrap", nameClassName)}>
          Job Tracker<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  );
}
