"use client";

import { useActionState, useState, type ReactNode } from "react";
import { CalendarPlusIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import { ActionMessage } from "@/components/action-message";
import type { FormState } from "@/lib/form-state";
import { INTERVIEW_KINDS, INTERVIEW_KIND_LABELS } from "@/lib/schemas/interview";
import { addInterviewAction } from "../../today/actions";

const initialState: FormState = { status: "idle" };

// "Add interview" on an application's page. A Client Component for the
// dialog's open state and the form state; the action validates everything
// again (createInterviewSchema). Unmounting the form on close resets it.
export function AddInterviewDialog({ applicationId, disabled }: { applicationId: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <MaybeDisabledTooltip disabled={disabled} message="Disabled in demo mode">
        <DialogTrigger
          render={
            <Button size="sm" variant="outline" disabled={disabled}>
              <CalendarPlusIcon />
              Add interview
            </Button>
          }
        />
      </MaybeDisabledTooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an interview</DialogTitle>
          <DialogDescription>It shows on Today, and you can add it to your calendar.</DialogDescription>
        </DialogHeader>
        <InterviewForm applicationId={applicationId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InterviewForm({ applicationId, onDone }: { applicationId: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const next = await addInterviewAction(prev, formData);
    if (next.status === "success") onDone();
    return next;
  }, initialState);
  const error = (field: string) => (state.status === "error" ? state.fieldErrors[field]?.[0] : undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field id="interview-at" label="When" error={error("at")}>
          <Input id="interview-at" name="at" type="datetime-local" required aria-invalid={Boolean(error("at"))} />
        </Field>
        <Field id="interview-duration" label="Minutes" error={error("durationMinutes")}>
          <Input id="interview-duration" name="durationMinutes" type="number" min={5} max={600} step={5} defaultValue={60} />
        </Field>
      </div>
      <Field id="interview-kind" label="Kind" error={error("kind")}>
        <NativeSelect id="interview-kind" name="kind" defaultValue="phone_screen" className="w-full">
          {INTERVIEW_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {INTERVIEW_KIND_LABELS[kind]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="interview-location" label="Where (optional)" error={error("location")}>
        <Input id="interview-location" name="location" maxLength={300} placeholder="Video link, phone number, or address" />
      </Field>
      <Field id="interview-notes" label="Notes (optional)" error={error("notes")}>
        <Textarea id="interview-notes" name="notes" rows={3} maxLength={1000} placeholder="Who you're meeting, what to prepare" />
      </Field>
      <ActionMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add interview"}
      </Button>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
