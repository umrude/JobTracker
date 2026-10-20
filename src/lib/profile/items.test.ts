import { describe, it, expect } from "vitest";
import { entryHeadingText, toProfileItems } from "@/lib/profile/items";
import type { Profile } from "@/lib/profile/types";

const now = new Date("2026-10-19T12:00:00Z");

const PROFILE: Profile = {
  skills: [
    {
      id: 1,
      userId: 1,
      name: "TypeScript",
      nameKey: "typescript",
      category: "Languages",
      aliases: [],
      proficiency: "proficient",
      experience: "personal",
      note: null,
      source: "resume",
      sourceJobId: null,
      sortOrder: 0,
      createdAt: now,
    },
  ],
  entries: [
    {
      id: 2,
      userId: 1,
      section: "Experience",
      title: "Web Developer",
      dates: "2020 – 2025",
      subtitle: "Graph'em Solutions",
      detail: "Burnaby, BC",
      latexKey: "web developer|graph'em solutions",
      source: "resume",
      sortOrder: 0,
      createdAt: now,
      bullets: [{ id: 3, userId: 1, entryId: 2, text: "Fixed the hardest bugs", source: "added", sortOrder: 0, createdAt: now }],
    },
  ],
  highlights: [{ id: 4, userId: 1, text: "5+ years of experience.", source: "gap", sourceJobId: 9, sortOrder: 0, createdAt: now }],
};

describe("toProfileItems", () => {
  it("gives every kind of item the same shape, with ids unique across kinds", () => {
    expect(toProfileItems(PROFILE)).toEqual([
      { id: "skill:1", kind: "skill", text: "TypeScript", source: "resume" },
      { id: "entry:2", kind: "entry", text: "Web Developer, Graph'em Solutions (2020 – 2025)", source: "resume" },
      { id: "bullet:3", kind: "bullet", text: "Fixed the hardest bugs", source: "added", parentId: "entry:2" },
      { id: "highlight:4", kind: "highlight", text: "5+ years of experience.", source: "gap" },
    ]);
  });
});

describe("entryHeadingText", () => {
  it("leaves out empty parts", () => {
    expect(entryHeadingText({ title: "Lighthouse Labs", subtitle: "", dates: "" })).toBe("Lighthouse Labs");
  });
});
