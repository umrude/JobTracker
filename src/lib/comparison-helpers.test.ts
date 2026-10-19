import { describe, it, expect } from "vitest";
import {
  clampScore,
  normalizeSkills,
  skillKey,
  withoutSkills,
} from "@/lib/comparison-helpers";

describe("clampScore", () => {
  it("keeps scores already in range", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(72)).toBe(72);
    expect(clampScore(100)).toBe(100);
  });

  it("clamps out-of-range scores", () => {
    expect(clampScore(104)).toBe(100);
    expect(clampScore(-5)).toBe(0);
  });

  it("rounds fractional scores", () => {
    expect(clampScore(87.5)).toBe(88);
    expect(clampScore(87.4)).toBe(87);
  });

  it("turns NaN into 0", () => {
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe("skillKey", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    expect(skillKey("  Type   Script ")).toBe("type script");
  });
});

describe("normalizeSkills", () => {
  it("trims, drops blanks, and dedupes case-insensitively", () => {
    expect(
      normalizeSkills(["React", " react ", "", "   ", "TypeScript", "typescript"]),
    ).toEqual(["React", "TypeScript"]);
  });

  it("keeps the first spelling seen", () => {
    expect(normalizeSkills(["postgreSQL", "PostgreSQL"])).toEqual(["postgreSQL"]);
  });

  it("collapses inner whitespace", () => {
    expect(normalizeSkills(["Next.js   App Router"])).toEqual(["Next.js App Router"]);
  });
});

describe("withoutSkills", () => {
  it("removes skills present in the exclude list, ignoring case", () => {
    expect(withoutSkills(["React", "AWS", "Go"], ["react", " go "])).toEqual(["AWS"]);
  });
});
