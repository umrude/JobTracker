"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { MessageState } from "@/lib/form-state";
import { confirmSuggestionAction, dismissSuggestionAction, linkSuggestionAction } from "../actions";

const idle: MessageState = { status: "idle" };

const selectClass =
  "h-8 min-w-0 max-w-64 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Message({ state }: { state: MessageState }) {
  if (state.status !== "error") return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

// Confirm and dismiss for one suggestion. A Client Component for the
// pending states and the error message ("the application has moved on").
// Each button is its own small form posting the suggestion's id; the
// server checks the id belongs to you and is still pending.
export function DecisionButtons({
  id,
  confirmLabel,
  dismissLabel,
  disabled,
}: {
  id: number;
  // Null when there's no change to confirm (news only).
  confirmLabel: string | null;
  dismissLabel: string;
  disabled: boolean;
}) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmSuggestionAction, idle);
  const [dismissState, dismissAction, dismissing] = useActionState(dismissSuggestionAction, idle);
  const busy = confirming || dismissing;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {confirmLabel && (
          <form action={confirmAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" size="sm" disabled={disabled || busy}>
              {confirming ? "Moving..." : confirmLabel}
            </Button>
          </form>
        )}
        <form action={dismissAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" size="sm" variant="outline" disabled={disabled || busy}>
            {dismissing ? "..." : dismissLabel}
          </Button>
        </form>
      </div>
      <Message state={confirmState} />
      <Message state={dismissState} />
    </div>
  );
}

// Picks the application an unlinked (or wrongly linked) email is about.
export function LinkForm({
  id,
  applications,
  currentId,
  disabled,
}: {
  id: number;
  applications: { id: number; label: string }[];
  currentId: number | null;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(linkSuggestionAction, idle);

  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="sr-only" htmlFor={`link-${id}`}>
          Application
        </label>
        <select id={`link-${id}`} name="applicationId" defaultValue={currentId ?? ""} className={selectClass} disabled={disabled}>
          <option value="" disabled>
            Pick an application...
          </option>
          {applications.map((app) => (
            <option key={app.id} value={app.id}>
              {app.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
          {pending ? "Linking..." : currentId ? "Relink" : "Link"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}
