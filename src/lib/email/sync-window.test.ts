import { describe, it, expect } from "vitest";
import { checkSyncStart, defaultSyncStart } from "@/lib/email/sync-window";

const now = new Date("2026-10-20T15:30:00Z");

describe("defaultSyncStart", () => {
  it("starts a week before the earliest application, at the start of the day", () => {
    expect(defaultSyncStart(new Date("2026-09-10T18:00:00Z"), now)).toEqual(new Date("2026-09-03T00:00:00Z"));
  });

  it("caps the lookback at about six months", () => {
    expect(defaultSyncStart(new Date("2025-01-01T00:00:00Z"), now)).toEqual(new Date("2026-04-20T00:00:00Z"));
  });

  it("looks back a month with no applications", () => {
    expect(defaultSyncStart(null, now)).toEqual(new Date("2026-09-20T00:00:00Z"));
  });
});

describe("checkSyncStart", () => {
  it("accepts a date within the past year", () => {
    expect(checkSyncStart(new Date("2026-01-15T12:00:00Z"), now)).toEqual({ ok: true, start: new Date("2026-01-15T00:00:00Z") });
  });

  it("refuses the future, more than a year back, and invalid dates", () => {
    expect(checkSyncStart(new Date("2026-11-01"), now).ok).toBe(false);
    expect(checkSyncStart(new Date("2025-06-01"), now).ok).toBe(false);
    expect(checkSyncStart(new Date("nonsense"), now).ok).toBe(false);
  });
});
