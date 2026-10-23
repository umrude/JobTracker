import Link from "next/link";
import { BriefcaseBusinessIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The app's mark: an indigo tile with a briefcase, and the name. `compact`
// shows the tile alone (the mobile header).
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/board" className={cn("flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
        <BriefcaseBusinessIcon className="size-5" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          Job Tracker<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  );
}
