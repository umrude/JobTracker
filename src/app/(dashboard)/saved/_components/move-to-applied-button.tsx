"use client";

import { useActionState } from "react";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { moveToAppliedAction } from "../actions";
import { ActionMessage } from "@/components/action-message";

const initialState: FormState = { status: "idle" };

// A Client Component only because it shows the pending state and the
// returned error. On success the action redirects to /board, so there's
// no success state to render here.
export function MoveToAppliedButton({
  jobId,
  disabled,
}: {
  jobId: number;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    moveToAppliedAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={jobId} />
      <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
        <Button type="submit" size="sm" disabled={disabled || pending}>
          <SendIcon />
          {pending ? "Moving..." : "Move to Applied"}
        </Button>
      </MaybeDisabledTooltip>
      <ActionMessage state={state} />
    </form>
  );
}
