import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getJobForComparison } from "@/server/db/comparisons";
import { getActiveResume } from "@/server/db/resumes";
import { getTailoringReview, type TailoringReview } from "@/server/tailoring";
import { idSchema } from "@/lib/schemas/form";
import type { CheckIssue } from "@/lib/schemas/tailoring";
import { GenerateButton } from "../_components/generate-button";
import { ReviewPanel } from "../_components/review-panel";
import { TrimPanel } from "../_components/trim-panel";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

// Prepare application: a tailored resume for one job (and, in Step 6, a
// cover letter). A Server Component: it reads the latest tailoring and its
// changes at render time. Generating, reviewing, approving, and trimming
// are small Client Components. See docs/tailored-resumes.md, Step 5c.
export default async function ApplyPage({ params }: PageProps<"/apply/[jobId]">) {
  await requireSession();

  const parsedId = idSchema.safeParse((await params).jobId);
  if (!parsedId.success) notFound();
  const job = await getJobForComparison(parsedId.data);
  if (!job) notFound();

  const [activeResume, review] = await Promise.all([getActiveResume(), getTailoringReview(job.id)]);
  const writable = isWritable();

  // The first reason that applies is shown on the disabled Generate button.
  const blocker = !writable
    ? "Disabled in demo mode"
    : !job.listingText
      ? "Add listing text to this job first"
      : !activeResume
        ? "Upload a resume first"
        : !activeResume.latexSource
          ? "Upload your .tex to enable tailored resumes"
          : undefined;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Link
        href={`/compare/${job.id}`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to the comparison
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Prepare application</h1>
        <p className="text-sm text-muted-foreground">
          {job.title} · {job.company}
        </p>
      </div>

      {activeResume && !activeResume.latexSource && (
        <Notice>
          Upload your .tex to enable tailored resumes.{" "}
          <Link href="/resume" className="underline underline-offset-4">
            Go to Resume
          </Link>
        </Notice>
      )}

      <TailoredResumeCard review={review} jobId={job.id} blocker={blocker} writable={writable} activeResumeId={activeResume?.id} />
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{children}</p>;
}

function TailoredResumeCard({
  review,
  jobId,
  blocker,
  writable,
  activeResumeId,
}: {
  review: TailoringReview;
  jobId: number;
  blocker: string | undefined;
  writable: boolean;
  activeResumeId: number | undefined;
}) {
  const { latest } = review;
  const generate = (label: string, variant: "default" | "outline") => (
    <GenerateButton jobId={jobId} label={label} variant={variant} disabled={blocker !== undefined} disabledMessage={blocker ?? ""} />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tailored resume</CardTitle>
        <CardDescription>
          Chosen and ordered from your profile for this listing. Nothing is added that your profile doesn&apos;t
          back up, and nothing is used until you approve it.
        </CardDescription>
        {latest && <CardAction>{generate("Generate a new version", "outline")}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!latest && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No tailored resume for this job yet.</p>
            {generate("Generate tailored resume", "default")}
          </div>
        )}

        {latest?.status === "invalid" && (
          <Notice>This version is in an older format and can&apos;t be shown. Generate a new version.</Notice>
        )}

        {latest?.status === "ok" && (
          <>
            <p className="text-xs text-muted-foreground">
              Version {latest.version} · {dateFormat.format(latest.createdAt)} ·{" "}
              {latest.model === "demo" ? "demo proposal" : latest.model}
              {latest.state === "approved" && " · Approved"}
            </p>
            {activeResumeId !== undefined && latest.resumeId !== activeResumeId && (
              <Notice>This was tailored from an older resume version. Generate a new version to use your current one.</Notice>
            )}
            {latest.proposal.rationale && (
              <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{latest.proposal.rationale}</blockquote>
            )}
            <CheckerFlags issues={latest.issues} />

            {review.reviewError && <Notice>{review.reviewError}</Notice>}

            {latest.state === "draft" && review.changes && (
              <ReviewPanel tailoringId={latest.id} jobId={jobId} changes={review.changes} disabled={!writable} />
            )}

            {latest.state === "approved" && (
              <ApprovedSummary review={review} tailoringId={latest.id} jobId={jobId} writable={writable} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// What the honesty checker reverted or removed before you saw the proposal.
function CheckerFlags({ issues }: { issues: CheckIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheckIcon className="size-4" />
        The honesty check changed {issues.length === 1 ? "one thing" : `${issues.length} things`} before showing you this
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {issues.map((issue) => (
          <li key={`${issue.itemId}-${issue.kinds.join()}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function ApprovedSummary({
  review,
  tailoringId,
  jobId,
  writable,
}: {
  review: TailoringReview;
  tailoringId: number;
  jobId: number;
  writable: boolean;
}) {
  const { pages, trimSuggestions } = review;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/tailored/${tailoringId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "default" })}
        >
          <FileTextIcon />
          Download PDF
        </a>
        <p className="text-sm text-muted-foreground">
          {pages === null ? "Page count unavailable." : pages === 1 ? "Fits on one page." : `${pages} pages.`}
        </p>
      </div>

      {pages !== null && pages > 1 && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">It runs past one page.</p>
          {trimSuggestions.length > 0 ? (
            <TrimPanel tailoringId={tailoringId} jobId={jobId} suggestions={trimSuggestions} disabled={!writable} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Generate a new version and reject some additions, or shorten bullets on the Profile page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
