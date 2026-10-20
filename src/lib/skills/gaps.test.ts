import { describe, it, expect } from "vitest";
import type { ProfileSkill } from "@/lib/profile/types";
import { describeGaps } from "@/lib/skills/gaps";
import { createSkillResolver } from "@/lib/skills/resolver";

const now = new Date("2026-10-19T12:00:00Z");

function skill(id: number, name: string, extra: Partial<ProfileSkill> = {}): ProfileSkill {
  return {
    id,
    userId: 1,
    name,
    nameKey: name.toLowerCase(),
    category: null,
    aliases: [],
    proficiency: null,
    experience: null,
    note: null,
    source: "resume",
    sourceJobId: null,
    sortOrder: 0,
    createdAt: now,
    ...extra,
  };
}

const SKILLS = [
  skill(1, "PostgreSQL"),
  skill(2, "Docker", { proficiency: "learning" }),
  skill(3, "Leaflet"),
  skill(5, "ECS"),
  skill(4, "TradingView", { aliases: ["TV charts"] }),
];

describe("describeGaps", () => {
  const resolver = createSkillResolver(SKILLS);

  it("marks gaps you have under another name as in your profile", () => {
    expect(describeGaps(["Postgres", "TV charts"], SKILLS, resolver).map((g) => g.status)).toEqual([
      "in_profile",
      "in_profile",
    ]);
  });

  it("marks gaps you're learning", () => {
    expect(describeGaps(["Docker"], SKILLS, resolver)[0].status).toBe("learning");
  });

  it("uses built-in aliases: AWS ECS is the ECS already in your profile", () => {
    expect(describeGaps(["AWS ECS"], SKILLS, resolver)[0].status).toBe("in_profile");
  });

  it("offers similar skills for gaps not in your profile", () => {
    expect(describeGaps(["Leaflet maps", "Kubernetes"], SKILLS, resolver)).toEqual([
      { name: "Leaflet maps", status: "absent", suggestions: [{ id: 3, name: "Leaflet" }] },
      { name: "Kubernetes", status: "absent", suggestions: [] },
    ]);
  });
});
