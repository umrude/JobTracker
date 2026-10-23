import type { Status } from "@/lib/schemas/status";

// Who or what moved an application from one status to another. See
// docs/status-history.md.
export const STATUS_CHANGE_SOURCES = [
  // You did, on the board: adding it, dragging it, editing it, or moving a
  // saved job to Applied.
  "board",
  // You confirmed an email suggestion (or added an application from one).
  "email",
  // You confirmed a ghosted-rule suggestion.
  "ghosted",
  // Reconstructed for applications that existed before history was kept.
  // The step happened; its date is a best guess.
  "estimated",
] as const;
export type StatusChangeSource = (typeof STATUS_CHANGE_SOURCES)[number];

// One step in an application's history, before it's stored.
export type StatusChange = {
  // null: the application was created at `to`.
  from: Status | null;
  to: Status;
  // When it happened, which for a confirmed email is the email's date, not
  // when you confirmed it.
  at: Date;
  source: StatusChangeSource;
  emailEventId: number | null;
};
