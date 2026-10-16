import { z } from "zod";

// Single source of truth for application status, shared by the DB schema,
// Server Action validation, and the kanban board UI.
export const STATUSES = [
  "saved",
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
  saved: "Saved",
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
