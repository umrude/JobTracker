import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
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
import { getActiveResume } from "@/server/db/resumes";
import { getLatestComparison } from "@/server/comparisons";
import { idSchema } from "@/lib/schemas/form";
import type { Comparison } from "@/lib/schemas/comparison";
import { scoreBand, type ScoreBand } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import { RunComparisonButton } from "../_components/run-comparison-button";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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

  const [activeResume, latest] = await Promise.all([
    getActiveResume(),
    getLatestComparison(job.id),
  ]);
  const writable = isWritable();

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
          <h1 className="text-xl font-semibold">{job.title}</h1>
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
        </div>
        <RunComparisonButton
          jobId={job.id}
          rerun={latest !== null}
          disabled={blocker !== undefined}
          disabledMessage={blocker ?? ""}
        />
      </div>

      {!job.listingText && (
        <Notice>
          This job has no listing text, so there&apos;s nothing to compare.{" "}
          <Link href="/saved" className="underline underline-offset-4">
            Add it on the Saved jobs page.
          </Link>
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
            Compared {dateFormat.format(latest.createdAt)} against resume v
            {latest.resumeVersion} · {latest.model === "demo" ? "demo result" : latest.model}
          </p>
          <ComparisonResult comparison={latest.comparison} />
        </>
      )}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {children}
    </p>
  );
}

const TONE_CLASSES: Record<ScoreBand["tone"], string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  solid: "text-sky-600 dark:text-sky-400",
  stretch: "text-amber-600 dark:text-amber-400",
  poor: "text-rose-600 dark:text-rose-400",
};

function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const band = scoreBand(comparison.score);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card>
        <CardHeader>
          <CardDescription>Match score</CardDescription>
          <CardTitle className={cn("text-5xl tabular-nums", TONE_CLASSES[band.tone])}>
            {comparison.score}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("font-medium", TONE_CLASSES[band.tone])}>{band.label}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SkillList
          title="Skills you have"
          description="Asked for in the listing and shown on your resume."
          items={comparison.matchedSkills}
          empty="None found."
        />
        <SkillList
          title="Gaps"
          description="Asked for in the listing, not shown on your resume."
          items={comparison.missingSkills}
          empty="No gaps found."
        />
        <SkillList
          title="Missing keywords"
          description="Terms from the listing that don't appear on your resume. Add only the ones that are true for you."
          items={comparison.missingKeywords}
          empty="None."
          className="md:col-span-2"
        />
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
