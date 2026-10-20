import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { describeTailoringContext, resumeToProfileIds } from "@/lib/tailoring/prompt-context";
import { demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const resolver = createSkillResolver(profile.skills);
const text = describeTailoringContext({
  profile,
  tex,
  resolver,
  comparison: { matchedSkills: ["React"], missingSkills: ["Kubernetes"] },
});

const id = (title: string) => profile.entries.find((e) => e.title === title)?.id;

describe("resumeToProfileIds", () => {
  it("maps every resume entry and bullet to its profile id", () => {
    const sections = resumeToProfileIds(profile, tex);
    const all = sections.flatMap((s) => s.entries);
    expect(all.every((e) => e.entryId !== null)).toBe(true);
    expect(all.flatMap((e) => e.bullets).every((b) => b.bulletId !== null)).toBe(true);
    expect(sections[1]?.entries[0]?.entryId).toBe(`entry:${id("Senior Frontend Engineer")}`);
  });
});

describe("describeTailoringContext", () => {
  it("lists skill categories with their ids, and skills with profile ids", () => {
    expect(text).toMatch(/- s1 Languages: TypeScript \(skill:\d+\)/);
  });

  it("marks which profile entries are on the resume", () => {
    expect(text).toContain(`entry:${id("Trail Conditions Map (Volunteer)")} Trail Conditions Map (Volunteer)`);
    expect(text).toMatch(/Trail Conditions Map \(Volunteer\).*\| on resume: no/);
    expect(text).toMatch(/Senior Frontend Engineer, Larkspur Logistics.*\| on resume: yes/);
  });

  it("flags Learning skills and skills without context", () => {
    expect(text).toMatch(/Docker \|.*\[LEARNING: never on the resume\]/);
    expect(text).toMatch(/Vercel \|.*no context: may be listed, never claimed/);
    expect(text).toMatch(/Python \|.*has context/);
  });

  it("includes the comparison when there is one", () => {
    expect(text).toContain("Gaps: Kubernetes");
  });
});
