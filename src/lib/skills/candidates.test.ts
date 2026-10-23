import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { skillCandidates } from "@/lib/skills/candidates";

const resolver = createSkillResolver([]);
const names = (phrase: string, profile: string[] = []) =>
  skillCandidates(phrase, resolver, new Set(profile.map((p) => resolver.resolve(p).key))).map((c) => c.name);
const has = (list: string[], wanted: string) => list.some((name) => name.toLowerCase().includes(wanted.toLowerCase()));

describe("skillCandidates", () => {
  it("splits a list in parentheses and drops leading filler", () => {
    const found = names("Expertise in managing cloud infrastructure (AWS, Azure, Google Cloud)");
    expect(has(found, "cloud infrastructure")).toBe(true);
    expect(has(found, "AWS") || has(found, "Amazon Web Services")).toBe(true);
    expect(has(found, "Azure")).toBe(true);
    expect(has(found, "Google Cloud")).toBe(true);
    expect(found.some((name) => /expertise|managing/i.test(name))).toBe(false);
  });

  it("splits on 'and', 'using', and 'including'", () => {
    expect(has(names("Practical experience with Azure Functions and serverless application patterns"), "Azure Functions")).toBe(true);
    const etl = names("Experience building and managing ETL/data workflows using Azure Data Factory");
    expect(has(etl, "Azure Data Factory")).toBe(true);
    expect(has(names("Proficiency with Microsoft SQL Server, including schema design and query optimization"), "SQL Server")).toBe(true);
  });

  it("finds known skills by their canonical names", () => {
    const found = names("Scripting in Python or PowerShell and automation tools");
    expect(has(found, "Python")).toBe(true);
    expect(has(found, "PowerShell")).toBe(true);
  });

  it("finds nothing skill-like in a sentence about experience", () => {
    expect(names("5+ years in the technology industry in increasingly senior roles (single Web Developer title throughout)")).not.toContain(
      "5+ years in the technology industry in increasingly senior roles",
    );
  });

  it("marks what's already in your profile", () => {
    const candidates = skillCandidates(
      "Expertise in managing cloud infrastructure (AWS, Azure, Google Cloud)",
      resolver,
      new Set([resolver.resolve("AWS").key]),
    );
    const aws = candidates.find((c) => resolver.resolve(c.name).key === resolver.resolve("AWS").key);
    expect(aws?.inProfile).toBe(true);
    expect(candidates.filter((c) => c.inProfile)).toHaveLength(1);
  });

  it("never offers more than eight", () => {
    expect(names("A, B1, C1, D1, E1, F1, G1, H1, I1, J1, K1").length).toBeLessThanOrEqual(8);
  });
});
