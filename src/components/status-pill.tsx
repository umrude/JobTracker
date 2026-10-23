import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { STATUS_STYLE } from "@/lib/status-style";
import { cn } from "@/lib/utils";

// A status in its color (lib/status-style.ts), as a pill. Shared by the
// application page, its timeline, and the comparison and Prepare pages.
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status].pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
