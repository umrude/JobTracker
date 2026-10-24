import { describe, expect, it } from "vitest";
import { createInterviewSchema } from "@/lib/schemas/interview";

// What the Add interview form sends (all strings, like FormData).
const form = { applicationId: "7", at: "2026-10-28T14:30", durationMinutes: "45", kind: "technical", location: "", notes: "" };

describe("createInterviewSchema", () => {
  it("reads the form: a local date and time, numbers, and empty optional fields", () => {
    const parsed = createInterviewSchema.parse(form);
    expect(parsed).toMatchObject({ applicationId: 7, durationMinutes: 45, kind: "technical", location: undefined, notes: undefined });
    // datetime-local has no time zone: it's local wall time.
    expect([parsed.at.getFullYear(), parsed.at.getMonth(), parsed.at.getDate(), parsed.at.getHours(), parsed.at.getMinutes()]).toEqual([
      2026, 9, 28, 14, 30,
    ]);
  });

  it("defaults the duration to an hour", () => {
    expect(createInterviewSchema.parse({ ...form, durationMinutes: undefined }).durationMinutes).toBe(60);
  });

  it("rejects a missing or impossible date, an unknown kind, and silly durations", () => {
    expect(createInterviewSchema.safeParse({ ...form, at: "" }).success).toBe(false);
    expect(createInterviewSchema.safeParse({ ...form, at: "2026-13-45T25:99" }).success).toBe(false);
    expect(createInterviewSchema.safeParse({ ...form, kind: "lunch" }).success).toBe(false);
    expect(createInterviewSchema.safeParse({ ...form, durationMinutes: "0" }).success).toBe(false);
    expect(createInterviewSchema.safeParse({ ...form, durationMinutes: "9000" }).success).toBe(false);
  });
});
