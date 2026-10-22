import { describe, it, expect } from "vitest";
import { formatUtcDate, plural } from "@/lib/format";

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
