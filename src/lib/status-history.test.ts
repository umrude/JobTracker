import { describe, expect, it } from "vitest";
import { creationChanges, reconstructHistory } from "@/lib/status-history";

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

describe("creationChanges", () => {
  it("starts a board-added application at its status, now", () => {
    expect(creationChanges({ status: "interviewing", appliedAt: null, at: day(10), source: "board" })).toEqual([
      { from: null, to: "interviewing", at: day(10), source: "board", emailEventId: null },
    ]);
  });

  it("dates an applied application by its applied date", () => {
    expect(creationChanges({ status: "applied", appliedAt: day(3), at: day(10), source: "board" })).toEqual([
      { from: null, to: "applied", at: day(3), source: "board", emailEventId: null },
    ]);
  });

  it("adds the earlier 'applied' step for one added at a later stage", () => {
    expect(
      creationChanges({ status: "acknowledged", appliedAt: day(1), at: day(4), source: "email", emailEventId: 7 }),
    ).toEqual([
      { from: null, to: "applied", at: day(1), source: "email", emailEventId: null },
      { from: "applied", to: "acknowledged", at: day(4), source: "email", emailEventId: 7 },
    ]);
  });
});

describe("reconstructHistory", () => {
  const base = { appliedAt: day(1), createdAt: day(1), updatedAt: day(1) };

  it("is a single estimated step for an application still at Applied", () => {
    expect(reconstructHistory({ ...base, status: "applied", confirmed: [] })).toEqual([
      { from: null, to: "applied", at: day(1), source: "estimated", emailEventId: null },
    ]);
  });

  it("uses confirmed emails, in date order, with their real dates and links", () => {
    const changes = reconstructHistory({
      ...base,
      status: "rejected",
      updatedAt: day(30),
      confirmed: [
        { id: 12, source: "email", status: "rejected", at: day(20) },
        { id: 11, source: "email", status: "acknowledged", at: day(2) },
      ],
    });
    expect(changes.map((c) => [c.from, c.to, c.at, c.source, c.emailEventId])).toEqual([
      [null, "applied", day(1), "estimated", null],
      ["applied", "acknowledged", day(2), "email", 11],
      ["acknowledged", "rejected", day(20), "email", 12],
    ]);
  });

  it("adds an estimated last step when the board moved it after the emails", () => {
    const changes = reconstructHistory({
      ...base,
      status: "offer",
      updatedAt: day(40),
      confirmed: [{ id: 3, source: "email", status: "interviewing", at: day(9) }],
    });
    expect(changes.at(-1)).toEqual({ from: "interviewing", to: "offer", at: day(40), source: "estimated", emailEventId: null });
  });

  it("never dates a step before the one it follows", () => {
    // Last updated before the email it confirmed (timestamps out of step).
    const changes = reconstructHistory({
      ...base,
      status: "offer",
      updatedAt: day(5),
      confirmed: [{ id: 3, source: "email", status: "interviewing", at: day(9) }],
    });
    expect(changes.at(-1)?.at).toEqual(day(9));
  });

  it("starts no later than the first email, and skips emails that changed nothing", () => {
    const changes = reconstructHistory({
      status: "ghosted",
      appliedAt: null,
      createdAt: day(15),
      updatedAt: day(15),
      confirmed: [
        { id: 1, source: "email", status: "applied", at: day(5) },
        { id: 2, source: "ghosted", status: "ghosted", at: day(14) },
      ],
    });
    expect(changes.map((c) => [c.from, c.to, c.at, c.source])).toEqual([
      [null, "applied", day(5), "estimated"],
      ["applied", "ghosted", day(14), "ghosted"],
    ]);
  });
});
