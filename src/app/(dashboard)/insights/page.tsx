import Link from "next/link";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { getCompareAllPlan, getInsights } from "@/server/insights";
import { MIN_SAMPLE, SCREENING_MIN, type Insights, type JobRef, type ProfileStanding, type SkillInsight, type Tally } from "@/lib/insights/build";
import { cn } from "@/lib/utils";
import { CompareAllButton } from "./_components/compare-all-button";

// How many skills the table shows: the most often missing.
const TOP_SKILLS = 25;

const scopeSchema = z.enum(["all", "applied"]).catch("all");

// A Server Component: every number is computed on the server from your
// data (server/insights.ts); only "Compare all" is a Client Component.
// Counts and facts only, never causes (docs/insights.md).
export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  await requireSession();
  const scope = scopeSchema.parse((await searchParams).scope);
  const [insights, plan] = await Promise.all([getInsights(scope), getCompareAllPlan()]);
  const writable = isWritable();

  const missing = insights.skills.filter((skill) => skill.missing > 0);
  const youHaveIt = missing.filter((skill) => skill.standing === "in_profile");

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            What your listings ask for that your resume doesn&apos;t show, and how that lines up with outcomes. Counts, not
            causes.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg border p-1 text-sm" aria-label="Which listings">
          <ScopeLink scope="all" current={scope}>
            All compared listings
          </ScopeLink>
          <ScopeLink scope="applied" current={scope}>
            Applications only
          </ScopeLink>
        </nav>
      </div>

      <Coverage insights={insights} plan={plan} writable={writable} />

      {insights.coverage.included === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing to analyze yet. Insights come from comparisons, and a comparison needs the job&apos;s listing: add listings,
          then compare them.
        </p>
      ) : (
        <>
          <OutcomeSummary insights={insights} />

          {youHaveIt.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>In your profile, but not on your resume</CardTitle>
                <CardDescription>
                  Listings asked for these and your resume didn&apos;t show them, but your profile has them. A tailored resume
                  can bring them forward.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {youHaveIt.map((skill) => (
                  <span key={skill.key} className="rounded-full border px-2.5 py-1 text-sm">
                    {skill.name} <span className="text-muted-foreground">· missing in {skill.missing}</span>
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          <SkillTable skills={missing.slice(0, TOP_SKILLS)} insights={insights} total={missing.length} />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        These are counts from your own comparisons. A skill missing in many rejections isn&apos;t necessarily why they were
        rejected, and small numbers say very little: anything with fewer than {MIN_SAMPLE} on either side is marked
        &quot;too few to compare&quot;.
      </p>
    </div>
  );
}

function ScopeLink({ scope, current, children }: { scope: "all" | "applied"; current: string; children: React.ReactNode }) {
  return (
    <Link
      href={scope === "all" ? "/insights" : "/insights?scope=applied"}
      aria-current={scope === current ? "page" : undefined}
      className={cn("rounded-md px-3 py-1", scope === current ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

function Coverage({ insights, plan, writable }: { insights: Insights; plan: Awaited<ReturnType<typeof getCompareAllPlan>>; writable: boolean }) {
  const { coverage } = insights;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {plural(coverage.included, "listing")} analyzed
          {insights.scope === "applied" && " (applications only)"}
        </CardTitle>
        <CardDescription>
          A job counts once it has a listing and a comparison of your resume as written.
          {coverage.listingChanged > 0 && ` ${plural(coverage.listingChanged, "comparison")} predate a listing edit; still counted.`}
          {coverage.olderResume > 0 && ` ${plural(coverage.olderResume, "comparison")} used an older resume version.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.count > 0 && (
          <div className="space-y-2">
            <p className="text-sm">
              {plural(plan.count, "job")} {plan.count === 1 ? "has" : "have"} a listing but no comparison yet.
            </p>
            <CompareAllButton
              count={plan.count}
              estimateUsd={plan.estimateUsd}
              model={plan.model}
              disabled={!writable}
              disabledMessage="Disabled in the read-only demo"
            />
          </div>
        )}
        {coverage.noListing.length > 0 && (
          <JobList
            summary={`${plural(coverage.noListing.length, "job")} without a listing ${coverage.noListing.length === 1 ? "isn't" : "aren't"} included`}
            hint="Add the listing on the board (edit the application) or the Saved jobs page, then compare it."
            jobs={coverage.noListing}
          />
        )}
      </CardContent>
    </Card>
  );
}

function JobList({ summary, hint, jobs }: { summary: string; hint: string; jobs: JobRef[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">{summary}</summary>
      <p className="mt-1 text-muted-foreground">{hint}</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {jobs.map((job) => (
          <li key={job.jobId}>
            <Link href={job.isApplication ? "/board" : "/saved"} className="underline-offset-4 hover:underline">
              {job.company} · {job.title}
            </Link>
            <span className="text-muted-foreground"> ({job.isApplication ? "application" : "saved"})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function OutcomeSummary({ insights }: { insights: Insights }) {
  const { outcomes } = insights;
  const stats = [
    { label: "Rejected", value: outcomes.rejected + outcomes.ghosted, note: outcomes.ghosted > 0 ? `${outcomes.ghosted} ghosted` : null },
    { label: "Progressed", value: outcomes.progressed, note: "interview or offer" },
    { label: "Waiting", value: outcomes.waiting, note: "applied or acknowledged" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{stat.label}</p>
          <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
          {stat.note && <p className="text-xs text-muted-foreground">{stat.note}</p>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Among analyzed applications.{" "}
        {insights.screeningSplit
          ? `${outcomes.rejectedAfterScreening} rejections are known to have passed screening, split out below.`
          : `${outcomes.rejectedAfterScreening} ${outcomes.rejectedAfterScreening === 1 ? "rejection is" : "rejections are"} known to have passed screening; the split by screening shows from ${SCREENING_MIN}. Tick "Passed screening" on the board when a portal says something like "Under Consideration".`}
      </p>
    </div>
  );
}

const STANDING: Record<ProfileStanding, { label: string; className: string }> = {
  in_profile: { label: "In your profile", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
  learning: { label: "Learning", className: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  absent: { label: "Not in profile", className: "text-muted-foreground" },
};

function SkillTable({ skills, insights, total }: { skills: SkillInsight[]; insights: Insights; total: number }) {
  const split = insights.screeningSplit;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Most often missing</CardTitle>
        <CardDescription>
          {total > skills.length ? `The top ${skills.length} of ${total} skills` : `${total} skills`} your resume didn&apos;t show,
          out of the listings that asked for each. Outcome columns count applications whose listing asked for it.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Skill</th>
              <th className="py-2 pr-3 font-medium">Missing</th>
              <th className="py-2 pr-3 font-medium">Your profile</th>
              <th className="py-2 pr-3 font-medium">Rejected: missing</th>
              <th className="py-2 pr-3 font-medium">Progressed: missing</th>
              {split && <th className="py-2 pr-3 font-medium">After screening</th>}
              {split && <th className="py-2 pr-3 font-medium">Stage unknown</th>}
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => {
              const { outcomes } = skill;
              const some = outcomes.rejected.total + outcomes.progressed.total > 0;
              return (
                <tr key={skill.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{skill.name}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {skill.missing} of {skill.asked}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", STANDING[skill.standing].className)}>
                      {STANDING[skill.standing].label}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    <Count tally={outcomes.rejected} />
                    {outcomes.rejected.ghosted.total > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        incl. ghosted {outcomes.rejected.ghosted.missing} of {outcomes.rejected.ghosted.total}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    <Count tally={outcomes.progressed} />
                    {some && !outcomes.comparable && <span className="block text-xs text-muted-foreground">too few to compare</span>}
                  </td>
                  {split && (
                    <td className="py-2 pr-3 tabular-nums">
                      <Count tally={outcomes.afterScreening} />
                    </td>
                  )}
                  {split && (
                    <td className="py-2 pr-3 tabular-nums">
                      <Count tally={outcomes.stageUnknown} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Count({ tally }: { tally: Tally }) {
  if (tally.total === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span>
      {tally.missing} of {tally.total}
    </span>
  );
}
