"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SquareIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { cn } from "@/lib/utils";
import { compareNextBatchAction } from "../actions";

type Progress = { done: number; failed: { company: string; message: string }[]; stopped: string | null; finished: boolean };

// "Compare all (N)": confirms with the model and a cost estimate, then
// compares in small batches until none are left, refreshing the numbers
// after each one. Stop takes effect after the batch in progress. A Client
// Component because it runs the loop and shows progress.
export function CompareAllButton({
  count,
  estimateUsd,
  model,
  disabled,
  disabledMessage,
}: {
  count: number;
  estimateUsd: number | null;
  model: string;
  disabled: boolean;
  disabledMessage: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  // A ref, not state: the loop reads it between batches, after renders.
  const stopRequested = useRef(false);

  async function run() {
    const cost =
      model === "demo"
        ? "Demo comparisons are canned and free."
        : estimateUsd === null
          ? "The cost for this model isn't known."
          : `Estimated cost: about $${estimateUsd < 0.01 ? "0.01" : estimateUsd.toFixed(2)} (a rough, high estimate).`;
    const confirmed = window.confirm(
      `Compare ${count} ${count === 1 ? "job" : "jobs"} against your active resume with ${model}? ${cost} You can stop at any time.`,
    );
    if (!confirmed) return;

    stopRequested.current = false;
    setRunning(true);
    const skip: number[] = [];
    let state: Progress = { done: 0, failed: [], stopped: null, finished: false };
    setProgress(state);
    try {
      while (!stopRequested.current) {
        const batch = await compareNextBatchAction(skip);
        skip.push(...batch.failed.map((f) => f.jobId));
        state = {
          done: state.done + batch.compared,
          failed: [...state.failed, ...batch.failed],
          stopped: batch.stopped,
          finished: batch.remaining === 0 || batch.compared + batch.failed.length === 0,
        };
        setProgress(state);
        router.refresh();
        if (batch.stopped || state.finished) break;
      }
    } catch {
      setProgress({ ...state, stopped: "Couldn't reach the app. What was compared is saved; run it again to continue." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex gap-2">
        <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
          <Button type="button" size="sm" onClick={run} disabled={disabled || running || count === 0}>
            <ZapIcon />
            {running ? `Comparing... ${progress?.done ?? 0} done` : `Compare all (${count})`}
          </Button>
        </MaybeDisabledTooltip>
        {running && (
          <Button type="button" size="sm" variant="outline" onClick={() => (stopRequested.current = true)}>
            <SquareIcon />
            Stop
          </Button>
        )}
      </div>
      {progress && !running && (
        <div role="status" className="space-y-1 text-sm">
          <p className={cn(progress.stopped && "text-destructive")}>
            Compared {progress.done}.
            {progress.stopped ? ` Stopped: ${progress.stopped}` : progress.finished ? " All done." : " Stopped; run it again to continue."}
          </p>
          {progress.failed.length > 0 && (
            <ul className="list-disc pl-5 text-muted-foreground">
              {progress.failed.map((f) => (
                <li key={`${f.company}-${f.message}`}>
                  {f.company}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
