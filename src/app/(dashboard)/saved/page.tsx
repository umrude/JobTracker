import Link from "next/link";
import { ExternalLinkIcon, PencilIcon, PlusIcon, ScaleIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMode, isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { listSavedJobs, type SavedJob } from "@/server/db/jobs";
import { SavedJobForm } from "./_components/saved-job-form";
import { MoveToAppliedButton } from "./_components/move-to-applied-button";
import { formatDate } from "@/lib/format";


// A Server Component: the list is read straight from the database at
// render time, and only the interactive pieces (the form dialog and the
// Move to Applied button) are Client Components.
export default async function SavedJobsPage() {
  await requireSession();

  const mode = await getMode();
  const writable = isWritable();
  const disabled = !writable;
  const jobs = await listSavedJobs();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Saved jobs</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "demo" && !writable
              ? "Demo mode: browsing seeded data. Adding and editing is disabled."
              : "Jobs you're considering but haven't applied to yet."}
          </p>
        </div>
        <SavedJobForm
          mode="add"
          disabled={disabled}
          trigger={
            <Button disabled={disabled}>
              <PlusIcon />
              Save a job
            </Button>
          }
        />
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No saved jobs yet. Paste a listing to save one for later.
        </p>
      ) : (
        <ul className="grid gap-4">
          {jobs.map((job) => (
            <li key={job.id}>
              <SavedJobCard job={job} disabled={disabled} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedJobCard({ job, disabled }: { job: SavedJob; disabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{job.title}</CardTitle>
        <CardDescription>
          {job.company} · saved {formatDate(job.savedAt)}
        </CardDescription>
        <CardAction>
          <SavedJobForm
            mode="edit"
            job={job}
            disabled={disabled}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${job.title} at ${job.company}`}
                disabled={disabled}
              >
                <PencilIcon />
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            View listing
            <ExternalLinkIcon className="size-3.5" />
          </a>
        )}
        {job.notes && <p className="whitespace-pre-wrap">{job.notes}</p>}
        {job.listingText ? (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">Listing text</summary>
            <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
              {job.listingText}
            </p>
          </details>
        ) : (
          <p className="text-muted-foreground">
            No listing text yet. Add it to compare against your resume.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {/* A real link styled as a button, so it navigates (and can open
            in a new tab) like any link. */}
        <Link
          href={`/compare/${job.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ScaleIcon />
          Compare
        </Link>
        <MoveToAppliedButton jobId={job.id} disabled={disabled} />
      </CardFooter>
    </Card>
  );
}
