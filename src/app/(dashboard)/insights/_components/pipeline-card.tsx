import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_LABELS, TIMING_LABELS, type Pipeline, type Timing } from "@/lib/insights/pipeline";
import { MIN_SAMPLE } from "@/lib/insights/build";
import { plural } from "@/lib/format";

// How far applications got, and how long each step took (docs/insights.md,
// "The pipeline"). A Server Component: plain markup.
//
// The funnel is one series of ordered stages, so it's horizontal bars in a
// single color (the app's primary, checked for contrast on both surfaces),
// each on a muted track showing the whole. The numbers are text beside the
// bars, never in the bar's color, and the bars are hidden from screen
// readers: the list of counts is the data. Time in each stage is a row of
// stat tiles, not a chart: each is a single headline number.
export function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How far applications get</CardTitle>
        <CardDescription>
          All {plural(pipeline.total, "application")}, from each one&apos;s history: the stages they reached, and how long
          the steps took.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pipeline.total === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <ol className="space-y-3">
                {pipeline.funnel.map(({ stage, count }) => {
                  const share = Math.round((100 * count) / pipeline.total);
                  return (
                    <li key={stage}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{FUNNEL_LABELS[stage]}</span>
                        <span className="tabular-nums">
                          {count} <span className="text-muted-foreground">· {share}%</span>
                        </span>
                      </div>
                      <div aria-hidden className="mt-1.5 h-3 bg-muted">
                        {/* Square at the baseline, a 4px rounded end at the value. */}
                        <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                {plural(pipeline.waiting, "application")} still waiting to hear back · {pipeline.ghosted} ghosted. Shares are of
                all applications. Hearing back includes rejections.
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Time in each stage</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {pipeline.timings.map((timing) => (
                  <TimingTile key={timing.key} timing={timing} />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Medians, in days, from dated steps only: steps whose dates were estimated for older applications are left
                out. Fewer than {MIN_SAMPLE} is too few to say much.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimingTile({ timing }: { timing: Timing }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{TIMING_LABELS[timing.key]}</p>
      {timing.medianDays === null ? (
        <p className="mt-1 text-sm text-muted-foreground">No dated examples yet.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold">
            {plural(timing.medianDays, "day")}
          </p>
          <p className="text-xs text-muted-foreground">
            {timing.minDays === timing.maxDays ? "" : `${timing.minDays}–${timing.maxDays} days · `}
            {timing.tooFew ? `only ${timing.sample}, too few to say much` : `from ${plural(timing.sample, "application")}`}
          </p>
        </>
      )}
    </div>
  );
}
