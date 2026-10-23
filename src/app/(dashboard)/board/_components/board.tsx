"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/schemas/status";
import type { ApplicationSummary } from "@/server/db/applications";
import { moveApplicationAction } from "../actions";
import { FilterIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { scoreDoc } from "@/lib/search/search";
import { Column } from "./column";
import { ApplicationCard } from "./application-card";
import { columnKeyboardCoordinates } from "./column-keyboard";

// Columns are droppables whose id is their status.
function isStatus(id: UniqueIdentifier | undefined): id is Status {
  return typeof id === "string" && (STATUSES as readonly string[]).includes(id);
}

// Read by screen readers when a card's drag handle is focused.
const SCREEN_READER_INSTRUCTIONS =
  "To move this application, press space or enter to pick it up, use the left and right arrow keys to move it between columns, then press space or enter to drop it. Press escape to cancel.";

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

  // Mouse: drag from anywhere on a card. Touch: press and hold first, so
  // a swipe still scrolls the page and the board. Keyboard: from the
  // card's drag handle, a whole column per arrow key (column-keyboard.ts).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  // What screen readers hear while a card moves, in names rather than ids.
  const describe = (id: UniqueIdentifier) => {
    const application = applications.find((a) => a.id === Number(id));
    return application ? `${application.title} at ${application.company}` : "the application";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ over }) => (isStatus(over?.id) ? `Over ${STATUS_LABELS[over.id]}.` : "Not over a column."),
    onDragEnd: ({ active, over }) =>
      isStatus(over?.id)
        ? `Dropped ${describe(active.id)} in ${STATUS_LABELS[over.id]}.`
        : `Dropped ${describe(active.id)}. It stays where it was.`,
    onDragCancel: ({ active }) => `Cancelled. ${describe(active.id)} stays where it was.`,
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    if (!isStatus(over.id)) return;
    const applicationId = Number(active.id);
    const newStatus = over.id;
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
      accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
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
      {/* Columns are equal height on wide screens (each one a full-height
          drop target), but size to their own cards on phones, where you
          swipe between them and the empty height was just blank space. */}
      {/* Focusable so the keyboard can scroll it sideways even when nothing
          in it is (the read-only demo has no drag handles). */}
      <div
        role="region"
        aria-label="Application columns"
        tabIndex={0}
        className="flex items-start gap-4 overflow-x-auto rounded-2xl pb-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:items-stretch"
      >
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
