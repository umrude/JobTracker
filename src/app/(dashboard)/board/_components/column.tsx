"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import type { ApplicationSummary } from "@/server/db/applications";
import { ApplicationCard } from "./application-card";

// Cards rendered per column before "Show more".
const COLUMN_PAGE = 20;

export function Column({
  status,
  applications,
  disabled,
}: {
  status: Status;
  applications: ApplicationSummary[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  // Long columns (Rejected, after a while) render the newest cards first
  // and the rest on request: every card is a draggable with listeners, so
  // hundreds at once slow the page down. See docs/performance.md.
  const [shown, setShown] = useState(COLUMN_PAGE);
  const visible = applications.slice(0, shown);
  const hidden = applications.length - visible.length;

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
        {visible.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            disabled={disabled}
          />
        ))}
        {hidden > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShown((n) => n + COLUMN_PAGE)}>
            Show {Math.min(hidden, COLUMN_PAGE)} more ({hidden} hidden)
          </Button>
        )}
      </div>
    </div>
  );
}
