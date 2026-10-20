"use client";

import { useActionState, useState, type ReactElement, type ReactNode } from "react";
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
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";
import type { FormState } from "@/lib/form-state";

type ProfileDialogProps = {
  title: string;
  description?: string;
  trigger: ReactElement;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  disabled: boolean;
  // The form fields. Plain inputs rendered by the (server) page, so each
  // kind of form doesn't need its own client component.
  children: ReactNode;
};

// One dialog for every profile form: add/edit a skill, entry, bullet, or
// highlight. A Client Component for the open state, the pending state,
// and showing errors; the fields themselves come in as children.
export function ProfileDialog(props: ProfileDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <MaybeDisabledTooltip disabled={props.disabled} message="Disabled in demo mode">
        <DialogTrigger render={props.trigger} />
      </MaybeDisabledTooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description && <DialogDescription>{props.description}</DialogDescription>}
        </DialogHeader>
        {/* Its own component so it unmounts on close, which resets the
            action state: reopening doesn't show the last attempt's errors. */}
        <ProfileForm action={props.action} submitLabel={props.submitLabel} onDone={() => setOpen(false)}>
          {props.children}
        </ProfileForm>
      </DialogContent>
    </Dialog>
  );
}

const initialState: FormState = { status: "idle" };

function ProfileForm({
  action,
  submitLabel,
  onDone,
  children,
}: {
  action: ProfileDialogProps["action"];
  submitLabel: string;
  onDone: () => void;
  children: ReactNode;
}) {
  // Same wrapping as the saved-job form: close from inside the action's
  // transition on success, instead of watching state in a useEffect.
  const [state, formAction, pending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const next = await action(prevState, formData);
      if (next.status === "success") onDone();
      return next;
    },
    initialState,
  );

  // Field errors are listed together, since the fields are plain children
  // this component can't annotate individually.
  const errors =
    state.status === "error"
      ? [...new Set(Object.values(state.fieldErrors).flatMap((messages) => messages ?? []))]
      : [];

  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state.status === "error" && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          {errors.length > 0 ? errors.map((error) => <p key={error}>{error}</p>) : <p>{state.message}</p>}
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
