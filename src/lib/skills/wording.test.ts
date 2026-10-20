import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { wordingNotes } from "@/lib/skills/wording";

const RESUME = "Built APIs in Node.js with PostgreSQL. Deployed to AWS. React and TypeScript front ends.";

describe("wordingNotes", () => {
  const resolver = createSkillResolver();

  it("notes a matched skill the resume writes differently", () => {
    expect(wordingNotes(["Postgres", "NodeJS"], RESUME, resolver)).toEqual([
      { listingTerm: "Postgres", resumeTerm: "PostgreSQL" },
      { listingTerm: "NodeJS", resumeTerm: "Node.js" },
    ]);
  });

  it("says nothing when the resume already uses the listing's words", () => {
    expect(wordingNotes(["React", "TypeScript", "AWS"], RESUME, resolver)).toEqual([]);
  });

  it("says nothing when the resume doesn't mention the skill at all", () => {
    // Not a wording problem: the comparison already decided it's matched,
    // perhaps from context; there's no other wording to point to.
    expect(wordingNotes(["Kubernetes"], RESUME, resolver)).toEqual([]);
  });

  it("uses your own aliases too", () => {
    const yours = createSkillResolver([{ name: "TradingView", aliases: ["TV charting library"] }]);
    expect(wordingNotes(["TV charting library"], "Embedded TradingView charts.", yours)).toEqual([
      { listingTerm: "TV charting library", resumeTerm: "TradingView" },
    ]);
  });

  it("notes each listing term once", () => {
    expect(wordingNotes(["Postgres", "postgres"], RESUME, resolver)).toHaveLength(1);
  });
});
