import { describe, it, expect } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { comparisonOutputSchema, comparisonSchema } from "@/lib/schemas/comparison";

const base = {
  score: 70,
  matchedSkills: ["React"],
  missingSkills: ["AWS"],
  missingKeywords: ["ECS"],
  suggestions: ["Mention the dashboard."],
};

describe("comparisonOutputSchema", () => {
  // Guards the "no transforms in the output schema" rule: zodOutputFormat
  // throws if one sneaks in.
  it("converts to a JSON Schema for structured outputs", () => {
    expect(() => zodOutputFormat(comparisonOutputSchema)).not.toThrow();
  });
});

describe("comparisonSchema", () => {
  it("rejects wrong types and missing fields", () => {
    expect(comparisonSchema.safeParse({ ...base, score: "70" }).success).toBe(false);
    expect(comparisonSchema.safeParse({ ...base, matchedSkills: "React" }).success).toBe(false);
    expect(comparisonSchema.safeParse({ score: 70 }).success).toBe(false);
  });

  it("clamps and rounds the score", () => {
    expect(comparisonSchema.parse({ ...base, score: 104 }).score).toBe(100);
    expect(comparisonSchema.parse({ ...base, score: -3 }).score).toBe(0);
    expect(comparisonSchema.parse({ ...base, score: 66.6 }).score).toBe(67);
  });

  it("trims, dedupes, and drops blank skills and keywords", () => {
    const result = comparisonSchema.parse({
      ...base,
      matchedSkills: [" React ", "react", ""],
      missingKeywords: ["ECS", "ecs", "  "],
    });
    expect(result.matchedSkills).toEqual(["React"]);
    expect(result.missingKeywords).toEqual(["ECS"]);
  });

  it("drops a missing skill that's also listed as matched", () => {
    const result = comparisonSchema.parse({
      ...base,
      matchedSkills: ["TypeScript"],
      missingSkills: ["typescript", "AWS"],
    });
    expect(result.missingSkills).toEqual(["AWS"]);
  });

  it("trims, dedupes, and caps suggestions", () => {
    const many = Array.from({ length: 15 }, (_, i) => `Suggestion ${i}`);
    const result = comparisonSchema.parse({
      ...base,
      suggestions: [" Same ", "Same", "", ...many],
    });
    expect(result.suggestions[0]).toBe("Same");
    expect(result.suggestions).toHaveLength(10);
  });

  it("caps long skill lists", () => {
    const skills = Array.from({ length: 50 }, (_, i) => `Skill ${i}`);
    expect(comparisonSchema.parse({ ...base, matchedSkills: skills }).matchedSkills).toHaveLength(30);
  });

  // Stored rows are re-validated on every read, so parsing a result a
  // second time must not change it.
  it("is stable when re-parsing its own output", () => {
    const messy = {
      score: 104.4,
      matchedSkills: [" React", "react", "TypeScript"],
      missingSkills: ["typescript", "AWS", "aws"],
      missingKeywords: ["ECS ", ""],
      suggestions: [" A ", "A", "B"],
    };
    const once = comparisonSchema.parse(messy);
    expect(comparisonSchema.parse(once)).toEqual(once);
  });
});
