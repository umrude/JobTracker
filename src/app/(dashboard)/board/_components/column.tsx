"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Status } from "@/lib/schemas/status";
import { STATUS_STYLE } from "@/lib/status-style";
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
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABELS[status]}: ${applications.length}`}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/5 transition-shadow",
        isOver && !disabled && "ring-2 ring-primary",
      )}
    >
      <h2 className="flex items-center gap-2 px-1 pt-1 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        <span className={cn("size-2 rounded-full", STATUS_STYLE[status].dot)} />
        {STATUS_LABELS[status]}
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] tracking-normal tabular-nums">{applications.length}</span>
      </h2>
      <div className="flex min-h-20 flex-col gap-2.5">
        {visible.map((application) => (
          <ApplicationCard key={application.id} application={application} disabled={disabled} />
        ))}
        {applications.length === 0 && (
          <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {disabled ? "Nothing here" : "Drag a card here"}
          </p>
        )}
        {hidden > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShown((n) => n + COLUMN_PAGE)}>
            Show {Math.min(hidden, COLUMN_PAGE)} more ({hidden} hidden)
          </Button>
        )}
      </div>
    </section>
  );
}
