"use client";

import { useActionState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { runComparisonAction } from "../actions";
import { ActionMessage } from "@/components/action-message";

const initialState: FormState = { status: "idle" };

// A Client Component only for the pending state and the returned error.
// On success the action revalidates this page, and the new result renders
// from the server, so there's no success state to show here.
export function RunComparisonButton({
  jobId,
  rerun,
  disabled,
  disabledMessage,
}: {
  jobId: number;
  rerun: boolean;
  disabled: boolean;
  disabledMessage: string;
}) {
  const [state, formAction, pending] = useActionState(runComparisonAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
        <Button
          type="submit"
          variant={rerun ? "outline" : "default"}
          disabled={disabled || pending}
        >
          {rerun ? <RefreshCwIcon className={pending ? "animate-spin" : undefined} /> : <SparklesIcon />}
          {pending ? "Comparing..." : rerun ? "Re-run" : "Run comparison"}
        </Button>
      </MaybeDisabledTooltip>
      <ActionMessage state={state} pending={pending} slow className="max-w-sm text-right" />
    </form>
  );
}
