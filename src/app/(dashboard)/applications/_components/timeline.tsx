import type { StatusHistoryRow } from "@/server/db/status-history-store";
import { formatDate } from "@/lib/format";
import { stepGap, stepOrigin, stepTitle } from "@/lib/status-history";
import { STATUS_LABELS } from "@/lib/schemas/status";
import { STATUS_STYLE } from "@/lib/status-style";
import { cn } from "@/lib/utils";

// An application's status history as a vertical timeline, in recorded
// order (see listStatusHistory). A Server Component: plain markup, nothing
// sent to the browser but the HTML.
export function Timeline({ history }: { history: StatusHistoryRow[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No status history recorded yet.</p>;
  }
  return (
    <ol className="space-y-5">
      {history.map((step, i) => {
        const gap = stepGap(history[i - 1]?.at, step.at);
        return (
          <li key={step.id} className="relative pl-7">
            {/* The line down to the next step, and this step's dot. */}
            {i < history.length - 1 && <span aria-hidden className="absolute top-4 bottom-[-1.25rem] left-[0.4375rem] w-px bg-border" />}
            <span
              aria-hidden
              className={cn("absolute top-1 left-0 size-3.5 rounded-full ring-4 ring-card", STATUS_STYLE[step.to].dot)}
            />
            <p className="text-sm font-medium">
              {stepTitle(step.from, step.to)}
              {step.from && <span className="font-normal text-muted-foreground"> from {STATUS_LABELS[step.from]}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={step.at.toISOString()}>{formatDate(step.at)}</time>
              {gap && ` · ${gap}`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stepOrigin(step)}</p>
          </li>
        );
      })}
    </ol>
  );
}

