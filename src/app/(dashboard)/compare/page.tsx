import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireSession } from "@/server/require-session";
import { listSavedJobs } from "@/server/db/jobs";
import { listApplicationSummaries } from "@/server/db/applications";
import { getActiveResume } from "@/server/db/resumes";
import { listLatestComparisons, type StoredComparison } from "@/server/comparisons";
import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { scoreBand } from "@/lib/score-band";

type Row = { id: number; title: string; company: string; hasListing: boolean; status?: Status };

// The job picker: every saved job and application with its latest score,
// if any. Applications are here too, so one added straight to the board
// (or from an email) can be compared once it has a listing, and count in
// insights. A Server Component with no client code at all; each row is a
// plain link.
export default async function CompareIndexPage() {
  await requireSession();

  const [jobs, applications, latest, activeResume] = await Promise.all([
    listSavedJobs(),
    listApplicationSummaries(),
    listLatestComparisons(),
    getActiveResume(),
  ]);
  const saved: Row[] = jobs.map((job) => ({ ...job, hasListing: job.listingText !== null }));
  // A comparison is per job, so applications are listed by their job's id.
  const applied: Row[] = applications.map((app) => ({ id: app.jobId, title: app.title, company: app.company, hasListing: app.hasListing, status: app.status }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Compare</h1>
        <p className="text-sm text-muted-foreground">
          {activeResume
            ? `Pick a job to compare against your active resume (v${activeResume.version}).`
            : "Upload a resume first, then pick a job to compare it against."}
        </p>
      </div>

      {saved.length === 0 && applied.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing to compare yet.{" "}
          <Link href="/saved" className="underline underline-offset-4">
            Save a listing first.
          </Link>
        </p>
      ) : (
        <>
          <JobList heading="Saved jobs" rows={saved} latest={latest} activeResumeId={activeResume?.id} />
          <JobList heading="Applications" rows={applied} latest={latest} activeResumeId={activeResume?.id} />
        </>
      )}
    </div>
  );
}

function JobList({
  heading,
  rows,
  latest,
  activeResumeId,
}: {
  heading: string;
  rows: Row[];
  latest: Map<number, StoredComparison>;
  activeResumeId: number | undefined;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{heading}</h2>
      <ul className="divide-y rounded-lg border">
        {rows.map((job) => (
          <li key={job.id}>
            <Link href={`/compare/${job.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50">
              <span>
                <span className="font-medium">{job.title}</span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  · {job.company}
                  {job.status && ` · ${STATUS_LABELS[job.status]}`}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm">
                <ScoreSummary stored={latest.get(job.id)} activeResumeId={activeResumeId} hasListing={job.hasListing} />
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
