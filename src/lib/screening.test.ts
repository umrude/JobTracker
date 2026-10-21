import { describe, it, expect } from "vitest";
import { nextPassedScreeningAt } from "@/lib/screening";

const earlier = new Date("2026-09-01T00:00:00Z");
const now = new Date("2026-10-20T00:00:00Z");

describe("nextPassedScreeningAt", () => {
  it("is set by reaching Interviewing or Offer, and keeps the first date", () => {
    expect(nextPassedScreeningAt(null, "interviewing", now)).toEqual(now);
    expect(nextPassedScreeningAt(earlier, "offer", now)).toEqual(earlier);
  });

  it("stays unknown on other moves unless you tick it", () => {
    expect(nextPassedScreeningAt(null, "rejected", now)).toBeNull();
    expect(nextPassedScreeningAt(earlier, "rejected", now)).toEqual(earlier);
    expect(nextPassedScreeningAt(null, "acknowledged", now, true)).toEqual(now);
    expect(nextPassedScreeningAt(earlier, "rejected", now, false)).toBeNull();
  });

  it("can't be unticked while the status implies it", () => {
    expect(nextPassedScreeningAt(earlier, "interviewing", now, false)).toEqual(earlier);
  });
});
