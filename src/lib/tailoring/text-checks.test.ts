import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { numbersIn, rewriteProblems, skillKeysIn, withinLengthLimit } from "@/lib/tailoring/text-checks";

const resolver = createSkillResolver();

describe("numbersIn", () => {
  it("normalizes thousands separators and ignores units", () => {
    expect(numbersIn("Rooms of 1,000+ users; cut load from 6s to 1.8s; 60% smaller; 400+ dispatchers")).toEqual(
      new Set(["1000", "6", "1.8", "60", "400"]),
    );
  });
});

describe("skillKeysIn", () => {
  it("finds skills by name or alias, as whole terms", () => {
    expect(skillKeysIn("Built a Postgres-backed API in NodeJS with React.js", resolver)).toEqual(
      new Set(["postgresql", "node.js", "react"]),
    );
  });

  it("ignores ordinary words that are also skill aliases", () => {
    expect(skillKeysIn("The team's go-to debugger; planned the next steps for the rest of the team", resolver)).toEqual(
      new Set(),
    );
  });

  it("still finds the unambiguous forms of those skills", () => {
    expect(skillKeysIn("Golang services and a Next.js front end", resolver)).toEqual(new Set(["go", "next.js"]));
  });
});

describe("withinLengthLimit", () => {
  it("allows 20% growth, with leeway for short text", () => {
    const source = "a".repeat(100);
    expect(withinLengthLimit("a".repeat(120), source)).toBe(true);
    expect(withinLengthLimit("a".repeat(121), source)).toBe(false);
    expect(withinLengthLimit("a".repeat(45), "a".repeat(30))).toBe(true);
  });
});

describe("rewriteProblems", () => {
  const source = "Built a React front end to sort and filter tables of up to 1,000 tickers";

  it("accepts a faithful rewording", () => {
    expect(rewriteProblems("Built a React front end to filter and sort live tables of up to 1,000 tickers", source, resolver)).toEqual([]);
  });

  it("flags an invented number", () => {
    expect(rewriteProblems("Built a React front end that cut load time by 40% for 1,000 tickers", source, resolver)).toContain("new_number");
  });

  it("flags a skill the original didn't mention", () => {
    expect(rewriteProblems("Built a React and TypeScript front end for 1,000 tickers", source, resolver)).toContain("new_skill");
  });

  it("flags a rewrite that grew too much", () => {
    expect(
      rewriteProblems(`${source}, coordinating closely with design, product, and data teams on every release`, source, resolver),
    ).toContain("too_long");
  });
});
