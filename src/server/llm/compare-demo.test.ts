import { describe, it, expect } from "vitest";
import {
  DEMO_COMPARISONS,
  DEMO_FALLBACK_COMPARISON,
  getDemoComparison,
} from "@/server/llm/compare-demo";
import { SEED_SAVED_JOBS } from "@/server/db/seed";
import { comparisonSchema } from "@/lib/schemas/comparison";

describe("demo comparison fixtures", () => {
  it("has a fixture for every seeded saved job", () => {
    for (const job of SEED_SAVED_JOBS) {
      expect(DEMO_COMPARISONS, `missing fixture for ${job.company}`).toHaveProperty([job.url]);
    }
  });

  // If you change comparisonSchema, this tells you which fixtures to update.
  it("every fixture passes comparisonSchema", () => {
    for (const [url, fixture] of Object.entries(DEMO_COMPARISONS)) {
      const result = comparisonSchema.safeParse(fixture);
      expect(result.success, `fixture for ${url}: ${result.error?.message}`).toBe(true);
    }
    expect(comparisonSchema.safeParse(DEMO_FALLBACK_COMPARISON).success).toBe(true);
  });

  it("falls back to the generic result for an unknown or missing URL", () => {
    const fallback = comparisonSchema.parse(DEMO_FALLBACK_COMPARISON);
    expect(getDemoComparison("https://unknown.example/job")).toEqual(fallback);
    expect(getDemoComparison(null)).toEqual(fallback);
  });
});
