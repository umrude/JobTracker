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
import { ActionMessage } from "@/components/action-message";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: FormState = { status: "idle" };

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
        <NativeSelect id={`tone-${jobId}`} name="tone" defaultValue="professional" disabled={disabled}>
          {COVER_TONES.map((tone) => (
            <option key={tone} value={tone}>
              {TONE_LABELS[tone]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`length-${jobId}`}>Length</Label>
        <NativeSelect id={`length-${jobId}`} name="length" defaultValue="standard" disabled={disabled}>
          {COVER_LENGTHS.map((length) => (
            <option key={length} value={length}>
              {LENGTH_LABELS[length]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1">
        <MaybeDisabledTooltip disabled={disabled} message={disabledMessage}>
          <Button type="submit" disabled={disabled || pending}>
            <PenLineIcon />
            {pending ? "Writing..." : label}
          </Button>
        </MaybeDisabledTooltip>
      </div>
      <ActionMessage state={state} pending={pending} slow className="w-full" />
    </form>
  );
}
