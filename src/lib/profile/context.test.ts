import { describe, it, expect } from "vitest";
import { mentions, skillHasContext } from "@/lib/profile/context";
import type { Profile, ProfileSkill } from "@/lib/profile/types";

const now = new Date("2026-10-19T12:00:00Z");

function skill(name: string, extra: Partial<ProfileSkill> = {}): ProfileSkill {
  return {
    id: 1,
    userId: 1,
    name,
    nameKey: name.toLowerCase(),
    category: null,
    aliases: [],
    proficiency: null,
    experience: null,
    note: null,
    source: "added",
    sourceJobId: null,
    sortOrder: 0,
    createdAt: now,
    ...extra,
  };
}

const PROFILE: Profile = {
  skills: [],
  entries: [
    {
      id: 1,
      userId: 1,
      section: "Notable Projects",
      title: "Stock Scanner",
      dates: "2024",
      subtitle: "Stock Market Visualizer",
      detail: "React, Node.js, MongoDB",
      latexKey: null,
      source: "resume",
      sortOrder: 0,
      createdAt: now,
      bullets: [
        { id: 2, userId: 1, entryId: 1, text: "Embedded the TradingView charting library", source: "resume", sortOrder: 0, createdAt: now },
      ],
    },
  ],
  highlights: [{ id: 3, userId: 1, text: "The team's go-to debugger.", source: "resume", sourceJobId: null, sortOrder: 0, createdAt: now }],
};

describe("skillHasContext", () => {
  it("counts a note as context", () => {
    expect(skillHasContext(skill("Docker", { note: "Ran local dev in containers" }), PROFILE)).toBe(true);
  });

  it("counts a mention in a bullet, ignoring case", () => {
    expect(skillHasContext(skill("tradingview"), PROFILE)).toBe(true);
  });

  it("counts a project's tech line", () => {
    expect(skillHasContext(skill("MongoDB"), PROFILE)).toBe(true);
    expect(skillHasContext(skill("Node.js"), PROFILE)).toBe(true);
  });

  it("counts a mention by alias", () => {
    expect(skillHasContext(skill("Mongo Database", { aliases: ["MongoDB"] }), PROFILE)).toBe(true);
  });

  it("has no context when nothing mentions it", () => {
    expect(skillHasContext(skill("Kubernetes"), PROFILE)).toBe(false);
  });

  it("ignores a blank note", () => {
    expect(skillHasContext(skill("Kubernetes", { note: "  " }), PROFILE)).toBe(false);
  });
});

describe("mentions", () => {
  it("matches whole terms only", () => {
    expect(mentions("the team's go-to debugger", "go")).toBe(true); // "go-to": hyphen is a boundary
    expect(mentions("a good result", "go")).toBe(false);
    expect(mentions("javascript apps", "java")).toBe(false);
  });

  it("handles terms with punctuation", () => {
    expect(mentions("wrote c++ and c# services", "c++")).toBe(true);
    expect(mentions("wrote c++ and c# services", "c#")).toBe(true);
    expect(mentions("built node.js apis", "node.js")).toBe(true);
  });
});
