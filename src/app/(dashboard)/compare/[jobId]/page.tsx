import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getJobForComparison } from "@/server/db/comparisons";
import { getActiveResume, getResume } from "@/server/db/resumes";
import { loadProfile } from "@/server/db/profile";
import { getLatestComparison } from "@/server/comparisons";
import { listingChangedSince } from "@/lib/listing";
import { idSchema } from "@/lib/schemas/form";
import type { Comparison } from "@/lib/schemas/comparison";
import { scoreBand, type ScoreBand } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import { createSkillResolver } from "@/lib/skills/resolver";
import { describeGaps, type GapView } from "@/lib/skills/gaps";
import { wordingNotes, type WordingNote } from "@/lib/skills/wording";
import { RunComparisonButton } from "../_components/run-comparison-button";
import { GapDialog } from "../_components/gap-dialog";
import { formatDateTime } from "@/lib/format";
import { Notice } from "@/components/notice";
import { JobStage } from "../../saved/_components/job-stage";


// A Server Component that only reads: it shows the saved comparison and
// never calls the model. Running or re-running is an explicit click on
// RunComparisonButton, the page's only Client Component.
export default async function ComparePage({ params }: PageProps<"/compare/[jobId]">) {
  await requireSession();

  // Route params are untrusted strings from the URL, so validate them like
  // any other input.
  const parsedId = idSchema.safeParse((await params).jobId);
  if (!parsedId.success) notFound();

  const job = await getJobForComparison(parsedId.data);
  if (!job) notFound();

  const [activeResume, latest, profile] = await Promise.all([
    getActiveResume(),
    getLatestComparison(job.id),
    loadProfile(),
  ]);
  const writable = isWritable();

  // How the gaps relate to your profile, and where the listing and your
  // resume name the same skill differently. Labels only: the score is for
  // the resume as written and never changes because of the profile.
  const resolver = createSkillResolver(profile.skills);
  const comparedResume = latest ? await getResume(latest.resumeId) : undefined;
  const categories = [
    ...new Set(profile.skills.flatMap((skill) => (skill.category ? [skill.category] : []))),
  ];

  // The first reason that applies is shown on the disabled button.
  const blocker = !writable
    ? "Disabled in demo mode"
    : !job.listingText
      ? "Add listing text to this job first"
      : !activeResume
        ? "Upload a resume first"
        : undefined;

  const stale =
    latest !== null && activeResume !== undefined && latest.resumeId !== activeResume.id;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Link
        href="/compare"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        All comparisons
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {job.company}
            {job.url && (
              <>
                {" · "}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  View listing
                  <ExternalLinkIcon className="size-3" />
                </a>
              </>
            )}
          </p>
          <div className="mt-2 flex">
            <JobStage jobId={job.id} status={job.applicationStatus} writable={writable} />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Link href={`/apply/${job.id}`} className={buttonVariants({ variant: "default" })}>
            <FileTextIcon />
            Prepare application
          </Link>
          <RunComparisonButton
            jobId={job.id}
            rerun={latest !== null}
            disabled={blocker !== undefined}
            disabledMessage={blocker ?? ""}
          />
        </div>
      </div>

      {!job.listingText && (
        <Notice>
          This job has no listing text, so there&apos;s nothing to compare, and it isn&apos;t
          counted in insights. Add it on the{" "}
          <Link href="/saved" className="underline underline-offset-4">
            Saved jobs page
          </Link>
          , or edit the application on the{" "}
          <Link href="/board" className="underline underline-offset-4">
            board
          </Link>
          .
        </Notice>
      )}
      {!activeResume && (
        <Notice>
          You don&apos;t have an active resume yet.{" "}
          <Link href="/resume" className="underline underline-offset-4">
            Upload one first.
          </Link>
        </Notice>
      )}
      {latest && job.listingText && listingChangedSince(latest.listingHash, job.listingText) && (
        <Notice>
          The listing changed since this comparison. Re-run to compare against the current text; until
          then, insights keep counting this one.
        </Notice>
      )}
      {stale && activeResume && (
        <Notice>
          This was compared against resume v{latest.resumeVersion}, but v{activeResume.version}{" "}
          is now active. Re-run to compare against your current resume.
        </Notice>
      )}

      {latest === null ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Not compared yet. Run a comparison to see how your resume matches this listing.
        </p>
      ) : latest.status === "invalid" ? (
        <Notice>
          The saved comparison is in an older format and can&apos;t be shown. Re-run it to
          update.
        </Notice>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Compared {formatDateTime(latest.createdAt)} against resume v
            {latest.resumeVersion} · {latest.model === "demo" ? "demo result" : latest.model}
          </p>
          <ComparisonResult
            comparison={latest.comparison}
            resumeVersion={latest.resumeVersion}
            gaps={describeGaps(latest.comparison.missingSkills, profile.skills, resolver)}
            notes={wordingNotes(latest.comparison.matchedSkills, comparedResume?.text ?? "", resolver)}
            jobId={job.id}
            writable={writable}
            categories={categories}
          />
        </>
      )}
    </div>
  );
}

// 700 shades in light mode: the 600s fall below 4.5:1 on white for the
// band's label ("Strong fit"), which is normal-size text.
const TONE_CLASSES: Record<ScoreBand["tone"], string> = {
  strong: "text-emerald-700 dark:text-emerald-400",
  solid: "text-sky-700 dark:text-sky-400",
  stretch: "text-amber-700 dark:text-amber-400",
  poor: "text-rose-700 dark:text-rose-400",
};

function ComparisonResult({
  comparison,
  resumeVersion,
  gaps,
  notes,
  jobId,
  writable,
  categories,
}: {
  comparison: Comparison;
  resumeVersion: number;
  gaps: GapView[];
  notes: WordingNote[];
  jobId: number;
  writable: boolean;
  categories: string[];
}) {
  const band = scoreBand(comparison.score);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card>
        <CardHeader>
          {/* The heading names the card; the number is its content. */}
          <CardTitle className="text-sm font-normal text-muted-foreground">Match score for resume v{resumeVersion}</CardTitle>
          <p className={cn("font-heading text-5xl leading-snug font-medium tabular-nums", TONE_CLASSES[band.tone])}>
            {comparison.score}
          </p>
        </CardHeader>
        <CardContent>
          <p className={cn("font-medium", TONE_CLASSES[band.tone])}>{band.label}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            For your resume as written, which is what an applicant tracking system sees. Your
            profile isn&apos;t counted.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SkillList
          title="Skills you have"
          description="Asked for in the listing and shown on your resume."
          items={comparison.matchedSkills}
          empty="None found."
        />
        <GapsCard gaps={gaps} jobId={jobId} writable={writable} categories={categories} />
        <SkillList
          title="Missing keywords"
          description="Terms from the listing that don't appear on your resume. Add only the ones that are true for you."
          items={comparison.missingKeywords}
          empty="None."
          className="md:col-span-2"
        />
        {notes.length > 0 && <WordingCard notes={notes} />}
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Suggested resume tweaks</CardTitle>
        </CardHeader>
        <CardContent>
          {comparison.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suggestions.</p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {comparison.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkillList({
  title,
  description,
  items,
  empty,
  className,
}: {
  title: string;
  description: string;
  items: string[];
  empty: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li key={item} className="rounded-full border px-2.5 py-0.5 text-sm">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// The gaps, each labeled by how it relates to your profile. "I have this"
// only appears where writes are allowed.
function GapsCard({
  gaps,
  jobId,
  writable,
  categories,
}: {
  gaps: GapView[];
  jobId: number;
  writable: boolean;
  categories: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaps</CardTitle>
        <CardDescription>Asked for in the listing, not shown on your resume.</CardDescription>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gaps found.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {gaps.map((gap) => (
              <li key={gap.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm">
                {gap.name}
                {gap.status === "in_profile" && (
                  <span className="text-xs text-primary" title="In your profile, just not on this resume">
                    · In profile
                  </span>
                )}
                {gap.status === "learning" && <span className="text-xs text-muted-foreground">· Learning</span>}
                {gap.status === "partial" && (
                  <span className="text-xs text-primary" title="These are in your profile, just not on this resume">
                    · {gap.candidates.filter((c) => c.inProfile).map((c) => c.name).join(", ")} in profile
                  </span>
                )}
                {(gap.status === "absent" || gap.status === "partial") && writable && (
                  <GapDialog jobId={jobId} name={gap.name} suggestions={gap.suggestions} candidates={gap.candidates} categories={categories} />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Matched skills your resume names differently from the listing.
function WordingCard({ notes }: { notes: WordingNote[] }) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Wording</CardTitle>
        <CardDescription>
          You have these skills, but some applicant tracking systems match keywords literally.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {notes.map((note) => (
            <li key={note.listingTerm}>
              The listing says <strong>{note.listingTerm}</strong>; your resume says{" "}
              <strong>{note.resumeTerm}</strong>. Consider using both.
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
