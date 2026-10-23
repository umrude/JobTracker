import { describe, it, expect } from "vitest";
import { formatUtcDate, plural, sinceLabel } from "@/lib/format";

describe("format", () => {
  it("counts in words", () => {
    expect(plural(1, "email")).toBe("1 email");
    expect(plural(3, "email")).toBe("3 emails");
    expect(plural(2, "company", "companies")).toBe("2 companies");
  });

  it("shows a whole UTC day as that day everywhere", () => {
    expect(formatUtcDate(new Date("2026-09-03T00:00:00Z"))).toBe("Sep 3, 2026");
  });
});

describe("sinceLabel", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  it("says how long ago, compactly", () => {
    expect(sinceLabel(ago(0), now)).toBe("today");
    expect(sinceLabel(ago(3), now)).toBe("3d ago");
    expect(sinceLabel(ago(20), now)).toBe("2w ago");
    expect(sinceLabel(ago(100), now)).toBe("3mo ago");
    expect(sinceLabel(ago(-2), now)).toBe("today");
  });
});
