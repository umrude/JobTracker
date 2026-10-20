"use client";

import { useActionState } from "react";
import { PenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { COVER_LENGTHS, COVER_TONES } from "@/lib/schemas/cover-letter";
import { LENGTH_LABELS, TONE_LABELS } from "@/lib/cover-letter/labels";
import { generateCoverLetterAction } from "../actions";

const initialState: FormState = { status: "idle" };

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Tone and length, and the Write button. A Client Component for the
// pending state and the returned error; the selects are plain form inputs.
export function CoverLetterOptions({
  jobId,
  label,
  disabled,
  disabledMessage,
}: {
  jobId: number;
  label: string;
  disabled: boolean;
  disabledMessage: string;
}) {
  const [state, formAction, pending] = useActionState(generateCoverLetterAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="space-y-1">
        <Label htmlFor={`tone-${jobId}`}>Tone</Label>
        <select id={`tone-${jobId}`} name="tone" defaultValue="professional" className={selectClass} disabled={disabled}>
          {COVER_TONES.map((tone) => (
            <option key={tone} value={tone}>
              {TONE_LABELS[tone]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`length-${jobId}`}>Length</Label>
        <select id={`length-${jobId}`} name="length" defaultValue="standard" className={selectClass} disabled={disabled}>
          {COVER_LENGTHS.map((length) => (
            <option key={length} value={length}>
              {LENGTH_LABELS[length]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
          <Button type="submit" disabled={disabled || pending}>
            <PenLineIcon />
            {pending ? "Writing..." : label}
          </Button>
        </MaybeDisabledTooltip>
      </div>
      {pending && <p className="w-full text-xs text-muted-foreground">This can take up to a minute.</p>}
      {!pending && state.status === "error" && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
