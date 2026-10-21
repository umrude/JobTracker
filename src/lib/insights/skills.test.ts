import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { splitSkillPhrases } from "@/lib/insights/skills";

const resolver = createSkillResolver([]);
const row = (name: string, status: "matched" | "missing") => ({ key: resolver.resolve(name).key, name, status });

describe("splitSkillPhrases", () => {
  it("counts each known skill inside a phrase", () => {
    const split = splitSkillPhrases([row("AWS (ECS, RDS, S3)", "missing")], resolver);
    expect(split.map((s) => s.key)).toContain(resolver.resolve("AWS").key);
    expect(split.every((s) => s.status === "missing")).toBe(true);
    expect(split.length).toBeGreaterThan(1);
  });

  it("merges the same skill written different ways", () => {
    const split = splitSkillPhrases([row("Production PostgreSQL experience", "missing"), row("Postgres", "missing")], resolver);
    expect(split.filter((s) => s.key === resolver.resolve("PostgreSQL").key)).toHaveLength(1);
  });

  it("keeps a phrase with no known skill as written", () => {
    expect(splitSkillPhrases([row("Logistics domain knowledge", "missing")], resolver)).toEqual([row("Logistics domain knowledge", "missing")]);
  });

  it("counts a skill that's both matched and missing as matched", () => {
    const split = splitSkillPhrases([row("TypeScript", "matched"), row("Advanced TypeScript generics", "missing")], resolver);
    expect(split.find((s) => s.key === resolver.resolve("TypeScript").key)?.status).toBe("matched");
  });
});
