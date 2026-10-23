"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
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
import type { ApplicationDetails } from "@/server/db/applications";
import {
  addApplicationAction,
  deleteApplicationAction,
  editApplicationAction,
  loadApplicationAction,
} from "../actions";
import { MaybeDisabledTooltip } from "@/components/demo-tooltip";

type ApplicationFormProps =
  | { mode: "add"; disabled: boolean; trigger: ReactElement }
  | {
      mode: "edit";
      disabled: boolean;
      trigger: ReactElement;
      // The card only has a summary; the full application (listing, notes)
      // is loaded when the dialog opens. See docs/performance.md.
      applicationId: number;
      company: string;
      // Where to go after deleting it, when the dialog was opened from a
      // page about this application (which no longer exists afterwards).
      afterDelete?: string;
    };

export function ApplicationForm(props: ApplicationFormProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const application = props.mode === "edit" ? details : null;
  const loading = props.mode === "edit" && !details && !loadFailed;

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value || props.mode !== "edit") return;
    // Fresh each time it opens, so it never shows stale details.
    setDetails(null);
    setLoadFailed(false);
    startTransition(async () => {
      const loaded = await loadApplicationAction(props.applicationId);
      if (loaded) setDetails(loaded);
      else setLoadFailed(true);
    });
  }

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
      `Delete the application for ${props.company}?`,
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.set("id", String(props.applicationId));
    startTransition(async () => {
      await deleteApplicationAction(formData);
      setOpen(false);
      if (props.mode === "edit" && props.afterDelete) router.push(props.afterDelete);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <MaybeDisabledTooltip
        disabled={props.disabled}
        message="Disabled in demo mode"
      >
        <DialogTrigger render={props.trigger} />
      </MaybeDisabledTooltip>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {loadFailed && <p className="text-sm text-destructive">This application couldn&apos;t be loaded. Close and try again.</p>}
        {!loading && !loadFailed && (
        <form key={application?.id ?? "new"} action={handleSubmit} className="space-y-4">
          {application && (
            <input type="hidden" name="id" value={application.id} />
          )}
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              name="company"
              defaultValue={application?.company}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={application?.title}
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
              defaultValue={application?.url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="listingText">Listing (optional)</Label>
            <Textarea
              id="listingText"
              name="listingText"
              rows={4}
              placeholder="Paste the job description"
              defaultValue={application?.listingText ?? ""}
              className="max-h-48"
            />
            <p className="text-xs text-muted-foreground">
              Needed to compare it and count it in insights. If you no longer have
              the listing, leave it blank: it&apos;s simply left out.
            </p>
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
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="passedScreening"
              defaultChecked={application?.passedScreening ?? false}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Passed screening
              <span className="block text-xs text-muted-foreground">
                It reached a person: &quot;Under Consideration&quot; in the portal, or an
                interview (set automatically). Leave it unticked if you don&apos;t know.
              </span>
            </span>
          </label>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
