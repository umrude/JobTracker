"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { STATUSES, type Status } from "@/lib/schemas/status";
import type { ApplicationSummary } from "@/server/db/applications";
import { moveApplicationAction } from "../actions";
import { Column } from "./column";
import { ApplicationCard } from "./application-card";

export function Board({
  initialApplications,
  disabled,
}: {
  initialApplications: ApplicationSummary[];
  disabled: boolean;
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // useState's initial value only applies on mount, so a server re-render
  // after add/edit/delete (via revalidatePath) wouldn't otherwise reach
  // this client-held copy. Syncing it in an effect would cost an extra
  // render pass; doing it conditionally during render (React's documented
  // pattern for this) applies the new props immediately instead. The drag
  // handler still updates `applications` directly for instant optimistic
  // feedback mid-drag.
  const [prevInitialApplications, setPrevInitialApplications] =
    useState(initialApplications);
  if (initialApplications !== prevInitialApplications) {
    setPrevInitialApplications(initialApplications);
    setApplications(initialApplications);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const applicationId = Number(active.id);
    const newStatus = over.id as Status;
    const current = applications.find((a) => a.id === applicationId);
    if (!current || current.status === newStatus) return;

    const previousStatus = current.status;
    setApplications((prev) =>
      prev.map((a) =>
        a.id === applicationId ? { ...a, status: newStatus } : a,
      ),
    );

    startTransition(async () => {
      try {
        await moveApplicationAction(applicationId, newStatus);
      } catch {
        // Revert the optimistic move; the server rejected it (invalid
        // transition, demo mode, etc).
        setApplications((prev) =>
          prev.map((a) =>
            a.id === applicationId ? { ...a, status: previousStatus } : a,
          ),
        );
      }
    });
  }

  const activeApplication = applications.find((a) => a.id === activeId);

  return (
    <DndContext
      // dnd-kit auto-generates ids (e.g. for aria-describedby) from an
      // internal counter that isn't synced between the server render and
      // the client's first render, causing a hydration mismatch warning.
      // A stable id makes that generation deterministic.
      id="application-board"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            applications={applications.filter((a) => a.status === status)}
            disabled={disabled}
          />
        ))}
      </div>
      <DragOverlay>
        {activeApplication ? (
          <ApplicationCard application={activeApplication} disabled />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
