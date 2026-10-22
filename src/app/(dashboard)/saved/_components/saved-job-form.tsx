"use client";

import { useActionState, useState, useTransition, type ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";
import { LISTING_TEXT_MAX } from "@/lib/schemas/job";
import type { SavedJob } from "@/server/db/jobs";
import {
  createSavedJobAction,
  deleteSavedJobAction,
  updateSavedJobAction,
} from "../actions";
import { ActionMessage } from "@/components/action-message";

type SavedJobFormProps =
  | { mode: "add"; disabled: boolean; trigger: ReactElement }
  | { mode: "edit"; disabled: boolean; trigger: ReactElement; job: SavedJob };

export function SavedJobForm(props: SavedJobFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <MaybeDisabledTooltip disabled={props.disabled} message="Disabled in demo mode">
        <DialogTrigger render={props.trigger} />
      </MaybeDisabledTooltip>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "add" ? "Save a job" : "Edit saved job"}
          </DialogTitle>
          <DialogDescription>
            Paste the listing so you can compare it against your resume later.
          </DialogDescription>
        </DialogHeader>
        {/* The form body is its own component so it unmounts when the dialog
            closes. That resets useActionState, so reopening the dialog
            doesn't show the errors from the previous attempt. */}
        <SavedJobFormBody
          job={props.mode === "edit" ? props.job : undefined}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const initialState: FormState = { status: "idle" };

function SavedJobFormBody({
  job,
  onDone,
}: {
  job: SavedJob | undefined;
  onDone: () => void;
}) {
  const serverAction = job ? updateSavedJobAction : createSavedJobAction;
  // Wrapping the Server Action lets us close the dialog on success from
  // inside the action's transition, instead of watching `state` in a
  // useEffect and calling setState there.
  const [state, formAction, pending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const next = await serverAction(prevState, formData);
      if (next.status === "success") onDone();
      return next;
    },
    initialState,
  );
  const [deleting, startDelete] = useTransition();

  const fieldErrors = state.status === "error" ? state.fieldErrors : {};

  function handleDelete() {
    if (!job) return;
    if (!window.confirm(`Delete the saved job at ${job.company}?`)) return;

    const formData = new FormData();
    formData.set("id", String(job.id));
    startDelete(async () => {
      await deleteSavedJobAction(formData);
      onDone();
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      {job && <input type="hidden" name="id" value={job.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" name="company" errors={fieldErrors.company}>
          <Input id="company" name="company" defaultValue={job?.company} required />
        </Field>
        <Field label="Title" name="title" errors={fieldErrors.title}>
          <Input id="title" name="title" defaultValue={job?.title} required />
        </Field>
      </div>
      <Field label="Listing URL" name="url" errors={fieldErrors.url}>
        <Input
          id="url"
          name="url"
          type="url"
          placeholder="https://..."
          defaultValue={job?.url ?? ""}
        />
      </Field>
      <Field label="Listing text" name="listingText" errors={fieldErrors.listingText}>
        <Textarea
          id="listingText"
          name="listingText"
          rows={10}
          maxLength={LISTING_TEXT_MAX}
          className="max-h-80"
          placeholder="Paste the full job description"
          defaultValue={job?.listingText ?? ""}
        />
      </Field>
      <Field label="Notes" name="notes" errors={fieldErrors.notes}>
        <Textarea id="notes" name="notes" defaultValue={job?.notes ?? ""} />
      </Field>
      <ActionMessage state={state} />
      <DialogFooter className="gap-2 sm:justify-between">
        {job && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={pending || deleting}
          >
            Delete
          </Button>
        )}
        <Button type="submit" disabled={pending || deleting}>
          {pending ? "Saving..." : job ? "Save" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: string;
  errors: string[] | undefined;
  children: ReactElement;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {errors?.map((error) => (
        <p key={error} className="text-sm text-destructive">
          {error}
        </p>
      ))}
    </div>
  );
}
