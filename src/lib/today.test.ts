import { describe, expect, it } from "vitest";
import { followUpsDue, type FollowUpCandidate } from "@/lib/today";

const now = new Date(Date.UTC(2026, 9, 30));
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function candidate(overrides: Partial<FollowUpCandidate>): FollowUpCandidate {
  return {
    applicationId: 1,
    company: "Acme",
    title: "Engineer",
    status: "applied",
    appliedAt: daysAgo(12),
    createdAt: daysAgo(12),
    lastStatusChangeAt: null,
    lastEmailAt: null,
    followedUpAt: null,
    ghostedSuggested: false,
    ...overrides,
  };
}

describe("followUpsDue", () => {
  it("nudges an application that's been quiet for 10 days", () => {
    expect(followUpsDue([candidate({})], now)).toEqual([
      { applicationId: 1, company: "Acme", title: "Engineer", status: "applied", quietDays: 12, followedUpAt: null, pastGhosted: false },
    ]);
    expect(followUpsDue([candidate({ appliedAt: daysAgo(9), createdAt: daysAgo(9) })], now)).toEqual([]);
  });

  it("counts any sign of life: a status change, an email, or your own follow-up", () => {
    expect(followUpsDue([candidate({ lastStatusChangeAt: daysAgo(3) })], now)).toEqual([]);
    expect(followUpsDue([candidate({ lastEmailAt: daysAgo(3) })], now)).toEqual([]);
    expect(followUpsDue([candidate({ followedUpAt: daysAgo(3) })], now)).toEqual([]);
    // Following up starts the clock again: 10 more days, then another nudge.
    expect(followUpsDue([candidate({ appliedAt: daysAgo(40), followedUpAt: daysAgo(11) })], now)[0].quietDays).toBe(11);
  });

  it("only nudges while you're waiting to hear back", () => {
    for (const status of ["interviewing", "offer", "rejected", "ghosted"] as const) {
      expect(followUpsDue([candidate({ status })], now)).toEqual([]);
    }
    expect(followUpsDue([candidate({ status: "acknowledged" })], now)).toHaveLength(1);
  });

  it("leaves it to the Inbox when a ghosted suggestion is waiting", () => {
    expect(followUpsDue([candidate({ appliedAt: daysAgo(40), ghostedSuggested: true })], now)).toEqual([]);
  });

  it("says when it's past the ghosted rule's 30 days, and puts the quietest first", () => {
    const due = followUpsDue([candidate({ applicationId: 1 }), candidate({ applicationId: 2, appliedAt: daysAgo(35) })], now);
    expect(due.map((d) => [d.applicationId, d.pastGhosted])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("falls back to when it was added if it has no applied date", () => {
    expect(followUpsDue([candidate({ appliedAt: null, createdAt: daysAgo(15) })], now)[0].quietDays).toBe(15);
  });
});
