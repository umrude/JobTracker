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
import type { ApplicationWithJob } from "@/server/db/applications";
import { ApplicationForm } from "./application-form";

export function ApplicationCard({
  application,
  disabled,
}: {
  application: ApplicationWithJob;
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
          {application.job.title}
        </CardTitle>
        <CardAction>
          <ApplicationForm
            mode="edit"
            application={application}
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
      <CardContent className="px-3 text-xs text-muted-foreground">
        {application.job.company}
      </CardContent>
    </Card>
  );
}
