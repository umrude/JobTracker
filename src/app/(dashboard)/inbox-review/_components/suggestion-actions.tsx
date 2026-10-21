"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MessageState } from "@/lib/form-state";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { addAsApplicationAction, confirmSuggestionAction, dismissSuggestionAction, linkSuggestionAction } from "../actions";

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

export type LinkOption = { value: string; label: string };
export type LinkGroup = { label: string; options: LinkOption[] };

// Picks what an unlinked (or wrongly linked) email is about: an
// application or a saved job. Likely matches (same company) come first,
// so two near-identical roles at one company are side by side.
export function LinkForm({
  id,
  groups,
  current,
  disabled,
}: {
  id: number;
  groups: LinkGroup[];
  // "app:12" or "job:5", if it's linked.
  current: string | null;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(linkSuggestionAction, idle);

  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="sr-only" htmlFor={`link-${id}`}>
          Application or saved job
        </label>
        <select id={`link-${id}`} name="target" defaultValue={current ?? ""} className={selectClass} disabled={disabled}>
          <option value="" disabled>
            Pick an application...
          </option>
          {groups
            .filter((group) => group.options.length > 0)
            .map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={`${group.label}-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
          {pending ? "Linking..." : current ? "Relink" : "Link"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

// "Add as application", for an email about one you never added. Prefilled
// from the email (the company and role the classifier read, the status it
// implies, the date it arrived); you check it before saving. A Client
// Component for the pending state and the error message.
export function AddApplicationForm({
  id,
  company,
  title,
  status,
  appliedOn,
  disabled,
}: {
  id: number;
  company: string;
  title: string;
  status: Status;
  // "YYYY-MM-DD"
  appliedOn: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(addAsApplicationAction, idle);

  return (
    <form action={action} className="grid gap-2 pt-2 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <div className="space-y-1">
        <Label htmlFor={`add-company-${id}`}>Company</Label>
        <Input id={`add-company-${id}`} name="company" defaultValue={company} required disabled={disabled} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`add-title-${id}`}>Role</Label>
        <Input id={`add-title-${id}`} name="title" defaultValue={title} required disabled={disabled} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`add-status-${id}`}>Status</Label>
        <select id={`add-status-${id}`} name="status" defaultValue={status} className={selectClass} disabled={disabled}>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`add-date-${id}`}>Applied on</Label>
        <Input id={`add-date-${id}`} name="appliedOn" type="date" defaultValue={appliedOn} required disabled={disabled} className="w-44" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`add-listing-${id}`}>Listing (optional)</Label>
        <Textarea
          id={`add-listing-${id}`}
          name="listingText"
          rows={3}
          placeholder="Paste the job description, if you still have it"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">Without it, this application can&apos;t be compared or counted in insights.</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={disabled || pending}>
          {pending ? "Adding..." : "Add to board"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}
