import Link from "next/link";
import type { Status } from "@/lib/schemas/status";
import { StatusPill } from "@/components/status-pill";
import { MoveToAppliedButton } from "./move-to-applied-button";

// Where a job stands, for the comparison and Prepare application pages:
// its status pill (linking to the application's page) once you've applied,
// or "Move to Applied" while it's still a saved job. A Server Component;
// only the button is client-side.
export function JobStage({
  jobId,
  application,
  writable,
}: {
  jobId: number;
  application: { id: number; status: Status } | null;
  writable: boolean;
}) {
  if (application) {
    return (
      <Link
        href={`/applications/${application.id}`}
        title="The application's page: its history and emails"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <StatusPill status={application.status} className="h-7" />
      </Link>
    );
  }
  return <MoveToAppliedButton jobId={jobId} disabled={!writable} stay />;
}
