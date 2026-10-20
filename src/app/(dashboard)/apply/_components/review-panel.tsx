"use client";

import { useActionState, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessageState } from "@/lib/form-state";
import type { ReviewChange } from "@/lib/tailoring/changes";
import { approveTailoringAction } from "../actions";

type Decision = "accepted" | "rejected";

const initialState: MessageState = { status: "idle" };

// Reviewing a tailoring proposal, change by change, like reviewing an
// edit in an editor. A Client Component because it holds your decisions
// until you approve. Every change starts undecided, and Approve stays
// disabled until each one has a decision, so nothing is approved by
// accident. "Accept all" asks for confirmation first.
export function ReviewPanel({
  tailoringId,
  jobId,
  changes,
  disabled,
}: {
  tailoringId: number;
  jobId: number;
  changes: ReviewChange[];
  disabled: boolean;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [state, formAction, pending] = useActionState(approveTailoringAction, initialState);

  const decided = changes.filter((change) => decisions[change.id]).length;
  const accepted = changes.filter((change) => decisions[change.id] === "accepted").map((change) => change.id);
  const allDecided = decided === changes.length;

  const decide = (id: string, decision: Decision) => setDecisions((current) => ({ ...current, [id]: decision }));
  const decideAll = (decision: Decision) =>
    setDecisions(Object.fromEntries(changes.map((change) => [change.id, decision])));

  function acceptAll() {
    const undecided = changes.length - decided;
    const message =
      undecided > 0
        ? `Accept all ${changes.length} changes, including ${undecided} you haven't looked at yet?`
        : `Accept all ${changes.length} changes?`;
    if (window.confirm(message)) decideAll("accepted");
  }

  // Changes grouped for display (Summary, Skills, then each section), in
  // the order they were listed.
  const groups = [...new Set(changes.map((change) => change.group))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">
            {decided} of {changes.length}
          </span>{" "}
          changes reviewed · {accepted.length} accepted
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={acceptAll} disabled={disabled || changes.length === 0}>
            <CheckIcon />
            Accept all
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => decideAll("rejected")} disabled={disabled || changes.length === 0}>
            <XIcon />
            Reject all
          </Button>
        </div>
      </div>

      {changes.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No changes were proposed: your current resume already fits this listing as well as your profile allows.
        </p>
      )}

      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{group}</h3>
          {changes
            .filter((change) => change.group === group)
            .map((change) => (
              <ChangeCard
                key={change.id}
                change={change}
                decision={decisions[change.id]}
                onDecide={(decision) => decide(change.id, decision)}
                disabled={disabled}
              />
            ))}
        </section>
      ))}

      <form action={formAction} className="flex flex-col items-end gap-2 border-t pt-4">
        <input type="hidden" name="tailoringId" value={tailoringId} />
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="accepted" value={JSON.stringify(accepted)} />
        <Button type="submit" disabled={disabled || pending || !allDecided}>
          {pending ? "Approving..." : "Approve and build PDF"}
        </Button>
        {!allDecided && !disabled && (
          <p className="text-xs text-muted-foreground">Accept or reject every change to approve.</p>
        )}
        {state.status !== "idle" && (
          <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" && "text-destructive")}>
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}

function ChangeCard({
  change,
  decision,
  onDecide,
  disabled,
}: {
  change: ReviewChange;
  decision: Decision | undefined;
  onDecide: (decision: Decision) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        decision === "accepted" && "border-emerald-500/50 bg-emerald-500/5",
        decision === "rejected" && "border-border bg-muted/40 opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{change.label}</p>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="xs"
            variant={decision === "accepted" ? "default" : "outline"}
            onClick={() => onDecide("accepted")}
            disabled={disabled}
            aria-pressed={decision === "accepted"}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="xs"
            variant={decision === "rejected" ? "secondary" : "outline"}
            onClick={() => onDecide("rejected")}
            disabled={disabled}
            aria-pressed={decision === "rejected"}
          >
            Reject
          </Button>
        </div>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Lines title="Now" lines={change.before} tone="before" />
        <Lines title="Proposed" lines={change.after} tone="after" />
      </div>
    </div>
  );
}

function Lines({ title, lines, tone }: { title: string; lines: string[]; tone: "before" | "after" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "before" ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground italic">{tone === "before" ? "Not on your resume" : "Removed"}</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
