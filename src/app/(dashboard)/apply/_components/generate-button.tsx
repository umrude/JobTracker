"use client";

import { useActionState } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { generateTailoringAction } from "../actions";

const initialState: FormState = { status: "idle" };

// A Client Component only for the pending state and the returned error.
// On success the page re-renders from the server with the new draft.
export function GenerateButton({
  jobId,
  label,
  variant = "default",
  disabled,
  disabledMessage,
}: {
  jobId: number;
  label: string;
  variant?: "default" | "outline";
  disabled: boolean;
  disabledMessage: string;
}) {
  const [state, formAction, pending] = useActionState(generateTailoringAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
        <Button type="submit" variant={variant} disabled={disabled || pending}>
          <SparklesIcon />
          {pending ? "Tailoring..." : label}
        </Button>
      </MaybeDisabledTooltip>
      {pending && <p className="text-xs text-muted-foreground">This can take up to a minute.</p>}
      {!pending && state.status === "error" && (
        <p role="alert" className="max-w-sm text-right text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
