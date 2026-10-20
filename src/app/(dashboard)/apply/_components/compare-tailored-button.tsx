"use client";

import { useActionState } from "react";
import { ScaleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { compareTailoredAction } from "../actions";

const initialState: FormState = { status: "idle" };

// A Client Component only for the pending state and the returned error.
// On success the page re-renders with the tailored score.
export function CompareTailoredButton({
  tailoringId,
  jobId,
  rerun,
  disabled,
}: {
  tailoringId: number;
  jobId: number;
  rerun: boolean;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(compareTailoredAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="tailoringId" value={tailoringId} />
      <input type="hidden" name="jobId" value={jobId} />
      <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
        <Button type="submit" variant="outline" size="sm" disabled={disabled || pending}>
          <ScaleIcon />
          {pending ? "Comparing..." : rerun ? "Re-run tailored comparison" : "Compare tailored version"}
        </Button>
      </MaybeDisabledTooltip>
      {pending && <p className="text-xs text-muted-foreground">This can take up to a minute.</p>}
      {!pending && state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
