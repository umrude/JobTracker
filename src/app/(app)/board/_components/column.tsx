"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import type { ApplicationWithJob } from "@/server/db/applications";
import { ApplicationCard } from "./application-card";

export function Column({
  status,
  applications,
  disabled,
}: {
  status: Status;
  applications: ApplicationWithJob[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2",
        isOver && !disabled && "ring-2 ring-primary",
      )}
    >
      <h2 className="flex items-baseline justify-between px-2 py-1 text-sm font-medium">
        {STATUS_LABELS[status]}
        <span className="text-xs text-muted-foreground">
          {applications.length}
        </span>
      </h2>
      <div className="flex min-h-16 flex-col gap-2">
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
