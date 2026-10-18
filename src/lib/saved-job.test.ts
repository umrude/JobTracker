import { describe, it, expect } from "vitest";
import { toApplication } from "@/lib/saved-job";

const now = new Date("2026-10-18T12:00:00Z");

describe("toApplication", () => {
  it("creates an applied application stamped with the given time", () => {
    const result = toApplication(
      { id: 7, notes: "Referred by Sam", applicationCount: 0 },
      now,
    );
    expect(result).toEqual({
      ok: true,
      application: {
        jobId: 7,
        status: "applied",
        appliedAt: now,
        notes: "Referred by Sam",
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  it("carries no notes over when the job has none or only whitespace", () => {
    for (const notes of [null, "", "  \n "]) {
      const result = toApplication({ id: 1, notes, applicationCount: 0 }, now);
      expect(result.ok && result.application.notes).toBeNull();
    }
  });

  it("refuses a job that already has an application", () => {
    expect(
      toApplication({ id: 1, notes: null, applicationCount: 1 }, now),
    ).toEqual({ ok: false, reason: "already_applied" });
  });
});
