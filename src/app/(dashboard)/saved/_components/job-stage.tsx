import Link from "next/link";
import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { STATUS_STYLE } from "@/lib/status-style";
import { cn } from "@/lib/utils";
import { MoveToAppliedButton } from "./move-to-applied-button";

// Where a job stands, for the comparison and Prepare application pages:
// its status pill (linking to the board) once you've applied, or "Move to
// Applied" while it's still a saved job. A Server Component; only the
// button is client-side.
export function JobStage({
  jobId,
  status,
  writable,
}: {
  jobId: number;
  status: Status | null;
  writable: boolean;
}) {
  if (status) {
    return (
      <Link
        href="/board"
        title="On the board"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
          STATUS_STYLE[status].pill,
        )}
      >
        <span className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)} />
        {STATUS_LABELS[status]}
      </Link>
    );
  }
  return <MoveToAppliedButton jobId={jobId} disabled={!writable} stay />;
}
