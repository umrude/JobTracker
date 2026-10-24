"use client";

import { useActionState } from "react";
import { MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { ActionMessage } from "@/components/action-message";
import type { FormState } from "@/lib/form-state";
import { followedUpAction } from "../actions";

const initialState: FormState = { status: "idle" };

// "I followed up" on a nudge. A Client Component only for the pending
// state and an error line; on success the page re-renders without the
// nudge, so there's nothing else to show.
export function FollowedUpButton({ applicationId, disabled }: { applicationId: number; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(followedUpAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="applicationId" value={applicationId} />
      <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
        <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
          <MailCheckIcon />
          {pending ? "Saving..." : "I followed up"}
        </Button>
      </MaybeDisabledTooltip>
      <ActionMessage state={state} />
    </form>
  );
}
