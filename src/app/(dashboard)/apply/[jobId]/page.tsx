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
import { listCoverLetters, type StoredCoverLetter } from "@/server/cover-letters";
import { getLatestComparison, getLatestTailoredComparison, type StoredComparison } from "@/server/comparisons";
import { scoreBand } from "@/lib/score-band";
import { CompareTailoredButton } from "../_components/compare-tailored-button";
import { LENGTH_LABELS, TONE_LABELS } from "@/lib/cover-letter/labels";
import { cn } from "@/lib/utils";
import { CoverLetterOptions } from "../_components/cover-letter-options";
import { LetterEditor } from "../_components/letter-editor";
import { JobStage } from "../../saved/_components/job-stage";
import { GenerateButton } from "../_components/generate-button";
import { ReviewPanel } from "../_components/review-panel";
import { TrimPanel } from "../_components/trim-panel";
import { formatDateTime } from "@/lib/format";
import { Notice } from "@/components/notice";


// Prepare application: a tailored resume and a cover letter for one job. A
// Server Component: it reads the latest tailoring, its changes, and the
// cover letter versions at render time. Generating, reviewing, approving,
// trimming, and editing are small Client Components. See
// docs/tailored-resumes.md (Step 5c) and docs/cover-letters.md.
export default async function ApplyPage({ params, searchParams }: PageProps<"/apply/[jobId]">) {
  await requireSession();

  const parsedId = idSchema.safeParse((await params).jobId);
  if (!parsedId.success) notFound();
  const job = await getJobForComparison(parsedId.data);
  if (!job) notFound();

  const [activeResume, review, letters, original] = await Promise.all([
    getActiveResume(),
    getTailoringReview(job.id),
    listCoverLetters(job.id),
    getLatestComparison(job.id),
  ]);
  // The approved tailored version's own comparison, if it has one (Step 7).
  const approvedId = review.latest?.status === "ok" && review.latest.state === "approved" ? review.latest.id : null;
  const tailored = approvedId === null ? null : await getLatestTailoredComparison(approvedId);
  const writable = isWritable();
  // Which cover letter version to show: ?letter=2, or the newest.
  const requested = idSchema.safeParse((await searchParams).letter);
  const letter = letters.find((l) => requested.success && l.version === requested.data) ?? letters[0];

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
        <h1 className="text-2xl font-semibold tracking-tight">Prepare application</h1>
        <p className="text-sm text-muted-foreground">
          {job.title} · {job.company}
        </p>
        <div className="mt-2 flex">
          <JobStage jobId={job.id} status={job.applicationStatus} writable={writable} />
        </div>
      </div>

      {activeResume && !activeResume.latexSource && (
        <Notice>
          Upload your .tex to enable tailored resumes.{" "}
          <Link href="/resume" className="underline underline-offset-4">
            Go to Resume
          </Link>
        </Notice>
      )}

      <TailoredResumeCard
        review={review}
        jobId={job.id}
        blocker={blocker}
        writable={writable}
        activeResumeId={activeResume?.id}
        scores={{ original, tailored }}
      />

      <CoverLetterCard
        jobId={job.id}
        letters={letters}
        letter={letter}
        writable={writable}
        // A letter doesn't need a .tex: it can be written from the parsed resume.
        blocker={!writable ? "Disabled in demo mode" : !job.listingText ? "Add listing text to this job first" : !activeResume ? "Upload a resume first" : undefined}
        hasApprovedTailoring={review.latest?.status === "ok" && review.latest.state === "approved"}
      />
    </div>
  );
}

function CoverLetterCard({
  jobId,
  letters,
  letter,
  writable,
  blocker,
  hasApprovedTailoring,
}: {
  jobId: number;
  letters: StoredCoverLetter[];
  letter: StoredCoverLetter | undefined;
  writable: boolean;
  blocker: string | undefined;
  hasApprovedTailoring: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cover letter</CardTitle>
        <CardDescription>
          {hasApprovedTailoring
            ? "Written from your approved tailored resume, so both stress the same experience."
            : "Written from your active resume. Approve a tailored resume first to write from that instead."}{" "}
          Edit it freely before you send it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CoverLetterOptions
          jobId={jobId}
          label={letters.length > 0 ? "Write a new version" : "Write cover letter"}
          disabled={blocker !== undefined}
          disabledMessage={blocker ?? ""}
        />

        {letters.length > 1 && (
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Cover letter versions">
            <span className="mr-1 text-muted-foreground">Versions:</span>
            {letters.map((l) => (
              <Link
                key={l.id}
                href={`/apply/${jobId}?letter=${l.version}`}
                aria-current={l.id === letter?.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-0.5",
                  l.id === letter?.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                v{l.version}
              </Link>
            ))}
          </nav>
        )}

        {letter && (
          <>
            <p className="text-xs text-muted-foreground">
              Version {letter.version} · {TONE_LABELS[letter.tone]} · {LENGTH_LABELS[letter.length]} ·{" "}
              {letter.basedOnTailoring ? "from the tailored resume" : "from your active resume"} ·{" "}
              {letter.model === "demo" ? "demo letter" : letter.model}
              {letter.edited && " · edited"}
            </p>
            {letter.warnings.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Check these before sending:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {letter.warnings.map((warning) => (
                    <li key={warning.message}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <LetterEditor key={`${letter.id}-${letter.text}`} id={letter.id} jobId={jobId} text={letter.text} disabled={!writable} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TailoredResumeCard({
  review,
  jobId,
  blocker,
  writable,
  activeResumeId,
  scores,
}: {
  review: TailoringReview;
  jobId: number;
  blocker: string | undefined;
  writable: boolean;
  activeResumeId: number | undefined;
  scores: Scores;
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
              Version {latest.version} · {formatDateTime(latest.createdAt)} ·{" "}
              {latest.model === "demo" ? "demo proposal" : latest.model}
              {latest.state === "approved" && " · Approved"}
              {latest.revisedFromId !== null && " · Revised with your notes"}
            </p>
            {latest.revisionNote && (
              <p className="text-sm">
                <span className="text-muted-foreground">Your note: </span>
                {latest.revisionNote}
              </p>
            )}
            {activeResumeId !== undefined && latest.resumeId !== activeResumeId && (
              <Notice>This was tailored from an older resume version. Generate a new version to use your current one.</Notice>
            )}
            {latest.proposal.rationale && (
              <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{latest.proposal.rationale}</blockquote>
            )}
            <CheckerFlags issues={latest.issues} />

            {review.reviewError && <Notice>{review.reviewError}</Notice>}

            {latest.state === "draft" && review.changes && (
              <ReviewPanel
                // One panel per version: a successful revision starts fresh.
                key={latest.id}
                tailoringId={latest.id}
                jobId={jobId}
                changes={review.changes}
                outline={review.outline}
                initialDecisions={review.decisions}
                yourIssues={review.yourIssues}
                disabled={!writable}
              />
            )}

            {latest.state === "approved" && (
              <ApprovedSummary review={review} tailoringId={latest.id} jobId={jobId} writable={writable} scores={scores} />
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

type Scores = { original: StoredComparison | null; tailored: StoredComparison | null };

// Original vs tailored score for the same listing, with the caution we
// agreed: the tailored resume was written toward this listing, so part of
// any gain reflects that rather than a better underlying fit.
function TailoredScore({
  scores,
  tailoringId,
  jobId,
  writable,
}: {
  scores: Scores;
  tailoringId: number;
  jobId: number;
  writable: boolean;
}) {
  const original = scores.original?.status === "ok" ? scores.original.comparison : null;
  const tailored = scores.tailored?.status === "ok" ? scores.tailored.comparison : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Match score for this listing</p>
      {tailored ? (
        <>
          <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
            {original && (
              <>
                <span className="text-muted-foreground">{original.score}</span>
                <span className="text-base text-muted-foreground" aria-label="to">
                  →
                </span>
              </>
            )}
            <span>{tailored.score}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {original ? "original → tailored" : "tailored"} · {scoreBand(tailored.score).label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            The tailored resume was written toward this listing, so part of any gain reflects that, not a better
            underlying fit. Tailoring can&apos;t add experience you don&apos;t have, so real gaps stay gaps.
          </p>
          {tailored.missingSkills.length > 0 && (
            <p className="text-sm">
              <span className="text-muted-foreground">Still missing: </span>
              {tailored.missingSkills.join(", ")}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          See how the tailored version scores against this listing
          {original ? `, compared with the original ${original.score}` : ""}.
        </p>
      )}
      <CompareTailoredButton tailoringId={tailoringId} jobId={jobId} rerun={tailored !== null} disabled={!writable} />
    </div>
  );
}

function ApprovedSummary({
  review,
  tailoringId,
  jobId,
  writable,
  scores,
}: {
  review: TailoringReview;
  tailoringId: number;
  jobId: number;
  writable: boolean;
  scores: Scores;
}) {
  const { pages, trimSuggestions, trimEntries } = review;
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

      <TailoredScore scores={scores} tailoringId={tailoringId} jobId={jobId} writable={writable} />

      {pages !== null && pages > 1 && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">It runs past one page.</p>
          {trimSuggestions.length > 0 || trimEntries.length > 0 ? (
            <TrimPanel tailoringId={tailoringId} jobId={jobId} suggestions={trimSuggestions} entries={trimEntries} disabled={!writable} />
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
