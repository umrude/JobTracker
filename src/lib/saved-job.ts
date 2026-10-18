import type { Status } from "@/lib/schemas/status";

// A saved job has no application yet, so there's no "from" status to run
// through canTransition(). The rule instead is: the only way onto the
// board from the Saved page is by applying, and a job can only be applied
// to once.
export const SAVED_JOB_TARGET_STATUS: Status = "applied";

export type SavedJobForConversion = {
  id: number;
  notes: string | null;
  applicationCount: number;
};

export type NewApplication = {
  jobId: number;
  status: Status;
  appliedAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ConversionResult =
  | { ok: true; application: NewApplication }
  | { ok: false; reason: "already_applied" };

// Pure: builds the application row for "Move to Applied" without touching
// the database, so the rules are unit-testable. `now` is a parameter rather
// than new Date() inside for the same reason.
export function toApplication(
  job: SavedJobForConversion,
  now: Date,
): ConversionResult {
  if (job.applicationCount > 0) {
    return { ok: false, reason: "already_applied" };
  }

  const notes = job.notes?.trim() ? job.notes : null;

  return {
    ok: true,
    application: {
      jobId: job.id,
      status: SAVED_JOB_TARGET_STATUS,
      appliedAt: now,
      notes,
      createdAt: now,
      updatedAt: now,
    },
  };
}
