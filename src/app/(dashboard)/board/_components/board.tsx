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
import { FilterIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { scoreDoc } from "@/lib/search/search";
import { Column } from "./column";
import { ApplicationCard } from "./application-card";

export function Board({
  initialApplications,
  initialFilter,
  disabled,
}: {
  initialApplications: ApplicationSummary[];
  // From ?q= (the header search's "Filter the board by ...").
  initialFilter: string;
  disabled: boolean;
}) {
  const [applications, setApplications] = useState(initialApplications);
  // Filters the cards already here by company and role, with the same
  // matching as the header search (lib/search/search.ts). Listing text
  // isn't on the board (docs/performance.md); the header search covers it.
  const [filter, setFilter] = useState(initialFilter);
  // A new ?q= (searching again from the header) replaces the filter, like
  // new applications replace the list below.
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setFilter(initialFilter);
  }
  const shown = filter.trim() === "" ? applications : applications.filter((a) => matchesCompanyOrRole(a, filter));
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <FilterIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Filter cards by company or role"
            placeholder="Filter by company or role"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-8"
          />
        </div>
        {filter.trim() !== "" && (
          <p className="text-sm text-muted-foreground" role="status">
            {shown.length} of {applications.length} applications
          </p>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            applications={shown.filter((a) => a.status === status)}
            disabled={disabled}
          />
        ))}
      </div>
      <DragOverlay>
        {activeApplication ? (
          // Lifted and tilted while dragging: a little life, and it reads as "picked up".
          <div className="rotate-2 rounded-xl shadow-xl shadow-foreground/10">
            <ApplicationCard application={activeApplication} disabled />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function matchesCompanyOrRole(app: ApplicationSummary, filter: string): boolean {
  return scoreDoc({ jobId: app.jobId, applicationId: app.id, company: app.company, title: app.title, listing: null, updatedAt: app.updatedAt }, filter) !== null;
}
