import { describe, it, expect } from "vitest";
import { skillKey } from "@/lib/comparison-helpers";
import { SKILL_ALIASES } from "@/lib/skills/aliases";
import { createSkillResolver, similarSkills } from "@/lib/skills/resolver";

describe("SKILL_ALIASES", () => {
  // A term listed under two skills would silently merge them.
  it("never maps one term to two different skills", () => {
    const owner = new Map<string, string>();
    for (const [name, aliases] of Object.entries(SKILL_ALIASES)) {
      for (const term of [name, ...aliases]) {
        const key = skillKey(term);
        const previous = owner.get(key);
        expect(previous === undefined || previous === name, `"${term}" is under ${previous} and ${name}`).toBe(true);
        owner.set(key, name);
      }
    }
  });

  it("keeps look-alike skills apart", () => {
    const resolver = createSkillResolver();
    const pairs: [string, string][] = [
      ["Angular", "AngularJS"],
      ["Java", "JavaScript"],
      ["React", "React Native"],
      ["UI Design", "UX Design"],
    ];
    for (const [a, b] of pairs) expect(resolver.resolve(a).key).not.toBe(resolver.resolve(b).key);
  });
});

describe("createSkillResolver", () => {
  const resolver = createSkillResolver();

  it("maps built-in aliases to one canonical skill, ignoring case and spacing", () => {
    for (const name of ["Postgres", "postgresql", "  PG ", "PSQL"]) {
      expect(resolver.resolve(name)).toEqual({ key: "postgresql", name: "PostgreSQL" });
    }
    expect(resolver.resolve("NodeJS")).toEqual({ key: "node.js", name: "Node.js" });
    expect(resolver.resolve("k8s").name).toBe("Kubernetes");
  });

  it("passes unknown skills through as themselves", () => {
    expect(resolver.resolve(" Pine Script ")).toEqual({ key: "pine script", name: "Pine Script" });
  });

  it("adds your profile aliases on top", () => {
    const yours = createSkillResolver([{ name: "TradingView", aliases: ["TV charts"] }]);
    expect(yours.resolve("tv charts")).toEqual({ key: "tradingview", name: "TradingView" });
  });

  it("resolves your profile skill to its built-in name when the list knows it", () => {
    const yours = createSkillResolver([{ name: "Postgres", aliases: ["Postgres DB"] }]);
    expect(yours.resolve("Postgres DB").name).toBe("PostgreSQL");
  });

  it("lists every known term for a skill", () => {
    const yours = createSkillResolver([{ name: "PostgreSQL", aliases: ["Postgres DB"] }]);
    expect(yours.termsFor("postgresql")).toEqual(
      expect.arrayContaining(["PostgreSQL", "postgres", "pg", "Postgres DB"]),
    );
  });
});

describe("similarSkills", () => {
  const skills = [{ name: "ECS" }, { name: "React" }, { name: "Go" }, { name: "Google Analytics" }];

  it("suggests skills that contain, or are contained in, the name as a whole term", () => {
    expect(similarSkills("AWS ECS", skills).map((s) => s.name)).toEqual(["ECS"]);
    expect(similarSkills("React Native", skills).map((s) => s.name)).toEqual(["React"]);
  });

  it("doesn't match inside other words", () => {
    // "Go" is a whole term in neither "Google Analytics" nor "Golang".
    expect(similarSkills("Golang", skills)).toEqual([]);
  });

  it("doesn't suggest the same skill", () => {
    expect(similarSkills("react", skills)).toEqual([]);
  });
});
