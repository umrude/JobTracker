import { z } from "zod";

// Single source of truth for application status, shared by the DB schema,
// Server Action validation, and the kanban board UI.
//
// There's deliberately no "saved" status: a job you haven't applied to yet
// is a `jobs` row with no application (see the Saved jobs page). An
// application row exists only once you've applied, so "saved" is defined
// by the shape of the data instead of a status value that could drift out
// of sync with appliedAt.
export const STATUSES = [
  "applied",
  "acknowledged",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
] as const;

export type Status = (typeof STATUSES)[number];

export const statusSchema = z.enum(STATUSES);

export const STATUS_LABELS: Record<Status, string> = {
  applied: "Applied",
  acknowledged: "Acknowledged",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

// This is a manually-driven kanban board: the person owns the column a card
// sits in and can drag it anywhere to correct a mistake or reflect a
// surprise (e.g. a "ghosted" application suddenly replies). The only move
// that isn't a real transition is dropping a card back on its own column.
export function canTransition(from: Status, to: Status): boolean {
  return from !== to;
}
