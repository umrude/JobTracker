import { describe, it, expect } from "vitest";
import { costUsd, estimateComparisonUsd } from "@/lib/llm-pricing";

describe("llm pricing", () => {
  it("prices known models and says when it can't", () => {
    expect(costUsd("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(costUsd("claude-haiku-5-5", 2_000_000, 0)).toBeCloseTo(0.2);
    expect(costUsd("some-future-model", 1000, 1000)).toBeNull();
  });

  it("estimates a comparison from the listing and resume length", () => {
    const short = estimateComparisonUsd("claude-opus-5-5", "x".repeat(400), "y".repeat(4000));
    const long = estimateComparisonUsd("claude-opus-5-5", "x".repeat(40_000), "y".repeat(4000));
    expect(short).toBeGreaterThan(0);
    expect(long ?? 0).toBeGreaterThan(short ?? 0);
    // Around five cents for a typical comparison on Opus 5.5.
    expect(short).toBeLessThan(0.1);
  });
});
