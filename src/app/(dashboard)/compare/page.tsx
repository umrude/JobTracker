import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireSession } from "@/server/require-session";
import { listSavedJobs } from "@/server/db/jobs";
import { getActiveResume } from "@/server/db/resumes";
import { listLatestComparisons, type StoredComparison } from "@/server/comparisons";
import { scoreBand } from "@/lib/score-band";

// The job picker: every saved job with its latest score, if any. A Server
// Component with no client code at all; each row is a plain link.
export default async function CompareIndexPage() {
  await requireSession();

  const [jobs, latest, activeResume] = await Promise.all([
    listSavedJobs(),
    listLatestComparisons(),
    getActiveResume(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Compare</h1>
        <p className="text-sm text-muted-foreground">
          {activeResume
            ? `Pick a saved job to compare against your active resume (v${activeResume.version}).`
            : "Upload a resume first, then pick a saved job to compare it against."}
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No saved jobs to compare.{" "}
          <Link href="/saved" className="underline underline-offset-4">
            Save a listing first.
          </Link>
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/compare/${job.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium">{job.title}</span>
                  <span className="text-sm text-muted-foreground"> · {job.company}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <ScoreSummary
                    stored={latest.get(job.id)}
                    activeResumeId={activeResume?.id}
                    hasListing={job.listingText !== null}
                  />
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreSummary({
  stored,
  activeResumeId,
  hasListing,
}: {
  stored: StoredComparison | undefined;
  activeResumeId: number | undefined;
  hasListing: boolean;
}) {
  if (!stored) {
    return (
      <span className="text-muted-foreground">
        {hasListing ? "Not compared" : "No listing text"}
      </span>
    );
  }
  if (stored.status === "invalid") {
    return <span className="text-muted-foreground">Needs re-run</span>;
  }

  const stale = activeResumeId !== undefined && stored.resumeId !== activeResumeId;
  return (
    <span>
      <span className="font-medium tabular-nums">{stored.comparison.score}</span>
      <span className="text-muted-foreground">
        {" "}
        · {scoreBand(stored.comparison.score).label}
        {stale && " · older resume"}
      </span>
    </span>
  );
}
