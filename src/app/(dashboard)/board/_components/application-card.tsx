"use client";

import { useDraggable } from "@dnd-kit/core";
import { PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ApplicationSummary } from "@/server/db/applications";
import { ApplicationForm } from "./application-form";

export function ApplicationCard({
  application,
  disabled,
}: {
  application: ApplicationSummary;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: application.id, disabled });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "touch-none gap-2 py-3",
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <CardHeader className="px-3">
        <CardTitle className="text-sm leading-snug">
          {application.title}
        </CardTitle>
        <CardAction>
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
                aria-label="Edit application"
                // Dragging starts on pointerdown; stop it here so the
                // button can register its own click instead of being
                // swallowed by the card's drag listeners.
                onPointerDown={(event) => event.stopPropagation()}
              >
                <PencilIcon />
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 text-xs text-muted-foreground">
        <p>{application.company}</p>
        {(application.passedScreening || !application.hasListing) && (
          <p className="flex flex-wrap gap-1">
            {application.passedScreening && (
              <span className="rounded-full border px-1.5 py-px">Passed screening</span>
            )}
            {!application.hasListing && (
              // A title, not a tooltip component: it's a quiet hint on a
              // draggable card, and native titles don't fight the drag.
              <span
                className="rounded-full border border-dashed px-1.5 py-px"
                title="No listing: it can't be compared or counted in insights. Edit to add it."
              >
                No listing
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
