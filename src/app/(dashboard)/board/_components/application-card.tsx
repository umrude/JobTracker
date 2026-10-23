"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { BadgeCheckIcon, CalendarDaysIcon, FileQuestionIcon, GripVerticalIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/company-avatar";
import { sinceLabel } from "@/lib/format";
import type { ApplicationSummary } from "@/server/db/applications";
import { ApplicationForm } from "./application-form";

// A mouse drags the card from anywhere on it, and touch from a press and
// hold anywhere on it (the listeners are on the card). The keyboard and
// screen readers use the grip button, which carries dnd-kit's drag
// attributes (role, instructions) and is the activator for the keyboard.
// So the card stays a plain <article>, not a button wrapped around another
// button (Edit), and it no longer blocks touch scrolling.
export function ApplicationCard({ application, disabled }: { application: ApplicationSummary; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      className={cn(
        "group space-y-2.5 rounded-xl bg-muted/60 p-3 text-sm ring-1 ring-transparent transition-[box-shadow,background-color] hover:bg-muted hover:ring-foreground/10 dark:bg-muted/50",
        // No text selection or callout menu on a press and hold.
        !disabled && "cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      {(application.passedScreening || !application.hasListing) && (
        <div className="flex flex-wrap gap-1.5">
          {application.passedScreening && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              <BadgeCheckIcon className="size-3" />
              Passed screening
            </span>
          )}
          {!application.hasListing && (
            // A title, not a tooltip component: it's a quiet hint on a
            // draggable card, and native titles don't fight the drag.
            <span
              className="inline-flex items-center gap-1 rounded-full bg-zinc-500/12 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
              title="No listing: it can't be compared or counted in insights. Edit to add it."
            >
              <FileQuestionIcon className="size-3" />
              No listing
            </span>
          )}
        </div>
      )}

      {/* The application's page. A click opens it; a press-and-move still
          drags the card (the mouse sensor waits for 4px of movement), and
          draggable={false} stops the browser's own link dragging taking over. */}
      <Link
        href={`/applications/${application.id}`}
        draggable={false}
        className="block leading-snug font-semibold underline-offset-4 outline-none hover:underline focus-visible:underline"
      >
        {application.title}
      </Link>

      <div className="flex items-center gap-2">
        <CompanyAvatar name={application.company} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{application.company}</span>
        {!disabled && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            aria-label={`Move ${application.title} at ${application.company}`}
            title="Drag to move, or press space and use the arrow keys"
            className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-60 outline-none group-hover:opacity-100 hover:bg-background/60 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        )}
        <ApplicationForm
          mode="edit"
          applicationId={application.id}
          company={application.company}
          disabled={disabled}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Edit ${application.company} application`}
              className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              // Dragging starts on pointerdown; stop it here so the
              // button can register its own click instead of being
              // swallowed by the card's drag listeners.
              onPointerDown={(event) => event.stopPropagation()}
            >
              <PencilIcon />
            </Button>
          }
        />
      </div>

      {application.appliedAt && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDaysIcon className="size-3.5" />
          {/* Counted in whole days from now; the server and browser render a
              second apart, so a day boundary can differ: harmless. */}
          <span suppressHydrationWarning>Applied {sinceLabel(application.appliedAt, new Date())}</span>
        </p>
      )}
    </article>
  );
}
