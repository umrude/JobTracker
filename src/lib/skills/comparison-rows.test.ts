import { describe, it, expect } from "vitest";
import { comparisonSkillRows } from "@/lib/skills/comparison-rows";
import { createSkillResolver } from "@/lib/skills/resolver";

describe("comparisonSkillRows", () => {
  const resolver = createSkillResolver();

  it("stores canonical names, so different spellings count as one skill", () => {
    expect(
      comparisonSkillRows({ matchedSkills: ["React.js", "Postgres", "PostgreSQL"], missingSkills: ["k8s"] }, resolver),
    ).toEqual([
      { skillKey: "react", name: "React", status: "matched" },
      { skillKey: "postgresql", name: "PostgreSQL", status: "matched" },
      { skillKey: "kubernetes", name: "Kubernetes", status: "missing" },
    ]);
  });

  it("counts a skill listed as both matched and missing as matched", () => {
    expect(comparisonSkillRows({ matchedSkills: ["Go"], missingSkills: ["Golang"] }, resolver)).toEqual([
      { skillKey: "go", name: "Go", status: "matched" },
    ]);
  });

  it("keeps unknown skills as they're written", () => {
    expect(comparisonSkillRows({ matchedSkills: [], missingSkills: ["Pine Script"] }, resolver)).toEqual([
      { skillKey: "pine script", name: "Pine Script", status: "missing" },
    ]);
  });
});
