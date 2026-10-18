"use client";

import { useState, useTransition, type ReactElement } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_LABELS } from "@/lib/schemas/status";
import type { ApplicationWithJob } from "@/server/db/applications";
import {
  addApplicationAction,
  deleteApplicationAction,
  editApplicationAction,
} from "../actions";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";

type ApplicationFormProps =
  | { mode: "add"; disabled: boolean; trigger: ReactElement }
  | {
      mode: "edit";
      disabled: boolean;
      trigger: ReactElement;
      application: ApplicationWithJob;
    };

export function ApplicationForm(props: ApplicationFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const application = props.mode === "edit" ? props.application : undefined;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (props.mode === "add") {
        await addApplicationAction(formData);
      } else {
        await editApplicationAction(formData);
      }
      setOpen(false);
    });
  }

  function handleDelete() {
    if (props.mode !== "edit") return;
    const confirmed = window.confirm(
      `Delete the application for ${props.application.job.company}?`,
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.set("id", String(props.application.id));
    startTransition(async () => {
      await deleteApplicationAction(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => setOpen(value)}>
      <MaybeDisabledTooltip
        disabled={props.disabled}
        message="Disabled in demo mode"
      >
        <DialogTrigger render={props.trigger} />
      </MaybeDisabledTooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "add" ? "Add application" : "Edit application"}
          </DialogTitle>
          <DialogDescription>
            {props.mode === "add"
              ? "Track a new job application."
              : "Update details or change its status."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {application && (
            <input type="hidden" name="id" value={application.id} />
          )}
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              name="company"
              defaultValue={application?.job.company}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={application?.job.title}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Listing URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://..."
              defaultValue={application?.job.url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              name="status"
              items={STATUS_LABELS}
              defaultValue={application?.status ?? "applied"}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={application?.notes ?? ""}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {props.mode === "edit" && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                Delete
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {props.mode === "add" ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
