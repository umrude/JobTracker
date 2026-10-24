import Link from "next/link";
import { CalendarDaysIcon, InboxIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { requireSession } from "@/server/require-session";
import { isWritable } from "@/server/mode";
import { loadToday } from "@/server/db/today";
import { countPendingSuggestions } from "@/server/db/email-events";
import type { UpcomingInterview } from "@/server/db/today-store";
import { INTERVIEW_KIND_LABELS } from "@/lib/schemas/interview";
import { FOLLOW_UP_AFTER_DAYS, type FollowUp } from "@/lib/today";
import { stepOriginShort, stepTitle } from "@/lib/status-history";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { FollowedUpButton } from "./_components/followed-up-button";

// Where the day starts (docs/today.md): interviews coming up, applications
// worth a follow-up, what's waiting in the Inbox, and the last week. All
// suggestions: nothing here changes a status. A Server Component; the
// only client code is the "I followed up" button.
export default async function TodayPage() {
  await requireSession();
  const now = new Date();
  const [{ interviews, followUps, activity }, pending] = await Promise.all([loadToday(now), countPendingSuggestions()]);
  const writable = isWritable();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{summary(interviews.length, followUps.length, pending)}</p>
      </div>

      {pending > 0 && (
        <Link
          href="/inbox-review"
          className="flex w-fit items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/80"
        >
          <InboxIcon className="size-4" />
          {plural(pending, "email suggestion")} waiting in the Inbox
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming interviews</CardTitle>
            <CardDescription>Add them from an application&apos;s page.</CardDescription>
          </CardHeader>
          <CardContent>
            {interviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">None scheduled.</p>
            ) : (
              <ul className="divide-y">
                {interviews.map((interview) => (
                  <InterviewRow key={interview.id} interview={interview} now={now} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow up?</CardTitle>
            <CardDescription>
              Waiting to hear back, with no email or change for {FOLLOW_UP_AFTER_DAYS} days or more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to chase.</p>
            ) : (
              <ul className="divide-y">
                {followUps.map((followUp) => (
                  <FollowUpRow key={followUp.applicationId} followUp={followUp} writable={writable} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 7 days</CardTitle>
          <CardDescription>Status changes, from each application&apos;s history.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes this week.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((step) => (
                // On a phone the text gets its own line under the pill and date,
                // instead of being squeezed between them.
                <li key={step.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                  <StatusPill status={step.to} />
                  {/* Beside the pill on a phone; at the end on wider screens. */}
                  <time dateTime={step.at.toISOString()} className="ml-auto text-xs text-muted-foreground sm:order-last">
                    {formatDate(step.at)}
                  </time>
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <Link href={`/applications/${step.applicationId}`} className="font-medium underline-offset-4 hover:underline">
                      {step.title} at {step.company}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {stepTitle(step.from, step.to)}, {stepOriginShort(step.source)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// One line for the top of the page.
function summary(interviews: number, followUps: number, pending: number): string {
  const parts = [
    interviews > 0 && plural(interviews, "interview") + " coming up",
    followUps > 0 && plural(followUps, "application") + " to follow up on",
    pending > 0 && plural(pending, "email") + " to review",
  ].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? "All caught up." : `${parts.join(", ")}.`;
}

const DAY = 24 * 60 * 60 * 1000;

function InterviewRow({ interview, now }: { interview: UpcomingInterview; now: Date }) {
  const soon = interview.at.getTime() - now.getTime() < DAY;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
      <div className="min-w-0">
        <h3 className="font-medium">
          <Link href={`/applications/${interview.applicationId}`} className="underline-offset-4 hover:underline">
            {INTERVIEW_KIND_LABELS[interview.kind]}: {interview.title} at {interview.company}
          </Link>
        </h3>
        <p className="text-muted-foreground">
          <time dateTime={interview.at.toISOString()}>{formatDateTime(interview.at)}</time>
          {soon && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">Within a day</span>}
          {interview.location && <> · {interview.location}</>}
        </p>
      </div>
      <a
        href={`/api/interviews/${interview.id}/ics`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        // Starts with the visible text, so voice control can say it (WCAG 2.5.3).
        aria-label={`Add to calendar: the interview with ${interview.company}`}
      >
        <CalendarDaysIcon />
        Add to calendar
      </a>
    </li>
  );
}

function FollowUpRow({ followUp, writable }: { followUp: FollowUp; writable: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
      <div className="min-w-0">
        <h3 className="font-medium">
          <Link href={`/applications/${followUp.applicationId}`} className="underline-offset-4 hover:underline">
            {followUp.title} at {followUp.company}
          </Link>
        </h3>
        <p className="text-muted-foreground">
          {plural(followUp.quietDays, "day")} without a word
          {followUp.followedUpAt && ` (you followed up ${formatDate(followUp.followedUpAt)})`}.
          {followUp.pastGhosted && " Long enough to call it ghosted, if you'd rather."}
        </p>
      </div>
      <FollowedUpButton applicationId={followUp.applicationId} disabled={!writable} />
    </li>
  );
}
