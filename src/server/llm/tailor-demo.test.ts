import { describe, it, expect } from "vitest";
import { createSkillResolver } from "@/lib/skills/resolver";
import { checkProposal } from "@/lib/tailoring/check";
import { DEMO_TAILORINGS, getDemoTailoring, resolveDemoProposal } from "@/server/llm/tailor-demo";
import { SEED_SAVED_JOBS } from "@/server/db/seed";
import { demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const context = { profile, tex, resolver: createSkillResolver(profile.skills) };

describe("demo tailoring fixtures", () => {
  it("are keyed by seeded job URLs", () => {
    const urls = new Set(SEED_SAVED_JOBS.map((job) => job.url));
    for (const url of Object.keys(DEMO_TAILORINGS)) expect(urls.has(url), url).toBe(true);
  });

  // A fixture whose text no longer matches the demo profile would silently
  // shrink; this catches it.
  it("resolve every skill, entry, and bullet to the demo profile", () => {
    for (const [url, fixture] of Object.entries(DEMO_TAILORINGS)) {
      const proposal = resolveDemoProposal(fixture, profile, tex);
      const skillCount = fixture.skills.reduce((n, group) => n + group.skills.length, 0);
      expect(proposal.skills.flatMap((g) => g.skillIds), url).toHaveLength(skillCount);
      const bulletCount = fixture.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets)).length;
      expect(proposal.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets)), url).toHaveLength(bulletCount);
    }
  });

  it("Northwind passes the checker except for its one deliberate violation", () => {
    const northwind = resolveDemoProposal(getDemoTailoring("https://careers.northwindrobotics.example/jobs/1821"), profile, tex);
    const { issues } = checkProposal(northwind, context);
    expect(issues).toEqual([expect.objectContaining({ kinds: ["new_skill"], resolution: "kept_original" })]);
    expect(issues[0]?.message).toContain('"WebSockets"');
  });

  it("Bramblewood passes the checker cleanly", () => {
    const bramblewood = resolveDemoProposal(getDemoTailoring("https://bramblewoodlearning.example/jobs/a11y-07"), profile, tex);
    expect(checkProposal(bramblewood, context).issues).toEqual([]);
  });

  it("an unknown job gets an empty proposal with an explanation", () => {
    const proposal = resolveDemoProposal(getDemoTailoring("https://unknown.example"), profile, tex);
    expect(proposal).toMatchObject({ summary: null, skills: [], sections: [] });
    expect(proposal.rationale).toMatch(/Demo mode/);
  });
});
