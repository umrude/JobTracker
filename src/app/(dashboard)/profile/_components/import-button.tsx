"use client";

import { useActionState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { MessageState } from "@/lib/form-state";
import { importFromResumeAction } from "../actions";

const initialState: MessageState = { status: "idle" };

// "Import from active resume", with the outcome shown underneath ("Added
// 3 skills, 1 bullet."). A Client Component for the pending state and the
// message.
export function ImportButton({ disabled, disabledMessage }: { disabled: boolean; disabledMessage: string }) {
  const [state, formAction, pending] = useActionState(importFromResumeAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
        <Button type="submit" variant="outline" disabled={disabled || pending}>
          <DownloadIcon />
          {pending ? "Importing..." : "Import from active resume"}
        </Button>
      </MaybeDisabledTooltip>
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "max-w-sm text-right text-sm text-destructive" : "max-w-sm text-right text-sm text-muted-foreground"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
