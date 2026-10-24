import { CalendarDaysIcon, Trash2Icon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Interview } from "@/server/db/today-store";
import { INTERVIEW_KIND_LABELS } from "@/lib/schemas/interview";
import { formatDateTime, plural } from "@/lib/format";
import { deleteInterviewAction } from "../../today/actions";

// An application's interviews: upcoming ones first (soonest first), then
// past ones. A Server Component; delete is a plain form posting a Server
// Action, and the calendar file is a plain link.
export function InterviewList({ interviews, now, writable }: { interviews: Interview[]; now: Date; writable: boolean }) {
  if (interviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No interviews yet.</p>;
  }
  const upcoming = interviews.filter((interview) => interview.at >= now);
  const past = interviews.filter((interview) => interview.at < now).reverse();
  return (
    <div className="space-y-4">
      {upcoming.length > 0 && <InterviewGroup title="Upcoming" interviews={upcoming} writable={writable} />}
      {past.length > 0 && <InterviewGroup title="Past" interviews={past} writable={writable} />}
    </div>
  );
}

function InterviewGroup({ title, interviews, writable }: { title: string; interviews: Interview[]; writable: boolean }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <ul className="divide-y">
        {interviews.map((interview) => (
          <li key={interview.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {INTERVIEW_KIND_LABELS[interview.kind]}
                <span className="font-normal text-muted-foreground"> · {plural(interview.durationMinutes, "minute")}</span>
              </p>
              <p className="text-muted-foreground">
                <time dateTime={interview.at.toISOString()}>{formatDateTime(interview.at)}</time>
                {interview.location && <> · {interview.location}</>}
              </p>
              {interview.notes && <p className="mt-1 whitespace-pre-wrap">{interview.notes}</p>}
            </div>
            <div className="flex flex-wrap gap-1">
              <a
                href={`/api/interviews/${interview.id}/ics`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                // Starts with the visible text, so voice control can say it (WCAG 2.5.3).
                aria-label={`Add to calendar: ${INTERVIEW_KIND_LABELS[interview.kind]}, ${formatDateTime(interview.at)}`}
              >
                <CalendarDaysIcon />
                Add to calendar
              </a>
              {writable && (
                <form action={deleteInterviewAction}>
                  <input type="hidden" name="id" value={interview.id} />
                  <input type="hidden" name="applicationId" value={interview.applicationId} />
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete this interview" title="Delete this interview">
                    <Trash2Icon />
                  </Button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
