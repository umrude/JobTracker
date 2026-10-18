import { describe, it, expect } from "vitest";
import { canTransition, STATUSES, statusSchema } from "@/lib/schemas/status";

describe("canTransition", () => {
  it("allows moving between any two different statuses", () => {
    expect(canTransition("applied", "interviewing")).toBe(true);
    expect(canTransition("offer", "applied")).toBe(true);
    expect(canTransition("ghosted", "interviewing")).toBe(true);
  });

  it("rejects transitioning a status to itself", () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe("statusSchema", () => {
  it("accepts every known status", () => {
    for (const status of STATUSES) {
      expect(statusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => statusSchema.parse("withdrawn")).toThrow();
  });

  it("rejects saved, which is a job with no application, not a status", () => {
    expect(() => statusSchema.parse("saved")).toThrow();
  });
});
