import { describe, it, expect } from "vitest";
import { applyResumeEdits, parseResumeLatex, type ParsedResumeLatex } from "@/lib/latex/resume";
import { createSkillResolver } from "@/lib/skills/resolver";
import type { TailoringProposal } from "@/lib/schemas/tailoring";
import { checkProposal } from "@/lib/tailoring/check";
import { toResumeEdits } from "@/lib/tailoring/to-edits";
import { DEMO_TEX, demoProfile, demoTex } from "@/test/demo-profile";

const profile = demoProfile();
const tex = demoTex();
const resolver = createSkillResolver(profile.skills);

const find = (title: string) => {
  const entry = profile.entries.find((e) => e.title === title);
  if (!entry) throw new Error(`no entry ${title}`);
  return entry;
};
const bulletRef = (title: string, index: number, text?: string) => {
  const bullet = find(title).bullets[index];
  if (!bullet) throw new Error(`no bullet ${index}`);
  return { bulletId: `bullet:${bullet.id}`, text: text ?? bullet.text };
};
const skillId = (name: string) => `skill:${profile.skills.find((s) => s.name === name)?.id}`;

// The whole pipeline: check the proposal, map it to edits, apply them to
// the demo .tex, and parse the result.
function tailor(proposal: TailoringProposal): ParsedResumeLatex {
  const checked = checkProposal(proposal, { profile, tex, resolver });
  expect(checked.issues).toEqual([]);
  const applied = applyResumeEdits(DEMO_TEX, toResumeEdits(checked.proposal, profile, tex));
  if (!applied.ok) throw new Error(applied.message);
  const parsed = parseResumeLatex(applied.tex);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.resume;
}

const empty: TailoringProposal = { summary: null, skills: [], sections: [], trimOrder: [], rationale: "" };

describe("toResumeEdits, end to end on the demo resume", () => {
  it("applies a summary, skills, reordered bullets, an added profile entry, and a new section", () => {
    const trail = "Trail Conditions Map (Volunteer)";
    const result = tailor({
      ...empty,
      summary: { text: "Frontend engineer with 6 years building React and TypeScript apps for real-time logistics.", sourceIds: [] },
      skills: [
        { categoryId: "s2", skillIds: [skillId("React"), skillId("D3"), skillId("Leaflet")] },
        { categoryId: "s1", skillIds: [skillId("TypeScript"), skillId("JavaScript")] },
      ],
      sections: [
        {
          section: "Notable Projects",
          isNew: false,
          afterSection: null,
          entries: [
            { entryId: `entry:${find(trail).id}`, bullets: [bulletRef(trail, 1)] },
            { entryId: `entry:${find("Dispatch Dashboard (Larkspur Logistics)").id}`, bullets: [bulletRef("Dispatch Dashboard (Larkspur Logistics)", 0)] },
          ],
        },
        {
          section: "Volunteering",
          isNew: true,
          afterSection: "Experience",
          entries: [{ entryId: `entry:${find("Mentor").id}`, bullets: [bulletRef("Mentor", 0)] }],
        },
      ],
    });

    expect(result.summary?.text).toBe("Frontend engineer with 6 years building React and TypeScript apps for real-time logistics.");
    expect(result.skills.map((s) => [s.category, s.items.map((i) => i.text)])).toEqual([
      ["Frontend", ["React", "D3", "Leaflet"]],
      ["Languages", ["TypeScript", "JavaScript"]],
    ]);
    expect(result.sections.map((s) => s.title)).toEqual(["Notable Projects", "Experience", "Volunteering", "Education"]);
    expect(result.sections[0]?.entries.map((e) => e.heading[0])).toEqual([trail, "Dispatch Dashboard (Larkspur Logistics)"]);
    // Experience wasn't in the proposal, so it's untouched.
    expect(result.sections[1]?.entries).toHaveLength(3);
    expect(result.sections[2]?.entries[0]?.bullets[0]?.text).toBe(
      "Taught weekly web development sessions to 12 high school students",
    );
  });

  it("rebuilds an entry from the profile when its heading was edited there", () => {
    const edited = structuredClone(profile);
    const senior = edited.entries.find((e) => e.title === "Senior Frontend Engineer");
    if (!senior) throw new Error("missing");
    senior.title = "Senior Frontend Engineer II";
    const edits = toResumeEdits(
      { ...empty, sections: [{ section: "Experience", isNew: false, afterSection: null, entries: [{ entryId: `entry:${senior.id}`, bullets: [{ bulletId: `bullet:${senior.bullets[0]?.id}`, text: senior.bullets[0]?.text ?? "" }] }] }] },
      edited,
      tex,
    );
    expect(edits.sections?.[0]?.entries[0]).toEqual({
      heading: ["Senior Frontend Engineer II", "2022 – Present", "Larkspur Logistics", "Portland, OR"],
      bullets: [senior.bullets[0]?.text],
    });
  });

  it("produces no edits for an empty proposal, leaving the file unchanged", () => {
    const edits = toResumeEdits(empty, profile, tex);
    expect(edits).toEqual({});
    const applied = applyResumeEdits(DEMO_TEX, edits);
    expect(applied.ok && applied.tex).toBe(DEMO_TEX);
  });
});
